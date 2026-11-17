"""Approved administrative roster adapter. Never store roster data in public/ or workspace exports."""
import json
import hashlib
import logging
import os
import re
from pathlib import Path
from fastapi import HTTPException, Request, Query

FIELDS = {'name', 'maskedId', 'role', 'placementStatus', 'administrativeNote'}
REGIONS = {r['code'] for r in json.loads((Path(__file__).parents[1] / 'src/indonesia/regions.json').read_text())['2025']['regions']}


def roster():
    path = os.environ.get('MALARIASCOPE_ROSTER_FILE')
    if not path:
        if os.environ.get('MALARIASCOPE_PERSONNEL_DEMO') == '1':
            return {'source': 'DEMO SINTETIS — bukan roster institusi', 'version': 'demo-v1', 'placementAsOf': '2026-11-17', 'demo': True,
                    'units': [{'id': 'demo-aceh', 'regionCode': '11.03', 'label': 'Unit Demo Aceh Timur'}, {'id': 'demo-jakarta', 'regionCode': '31.01', 'label': 'Unit Demo Jakarta'}],
                    'people': [{'id': f'demo-{i}', 'unitId': 'demo-aceh' if i < 5 else 'demo-jakarta', 'name': f'Personel Sintetis {i}', 'maskedId': f'DEMO-***{i}', 'role': 'Administrasi demo', 'placementStatus': 'ACTIVE' if i % 2 else 'INACTIVE', 'administrativeNote': 'Catatan administratif sintetis'} for i in range(1, 8)]}
        raise HTTPException(503, 'Sumber personel belum terhubung')
    try:
        p = Path(path).resolve()
        repo = Path(__file__).parents[1].resolve()
        if p.is_relative_to(repo):
            raise ValueError('Roster must be outside checkout')
        data = json.loads(p.read_text())
        if set(data) != {'source', 'version', 'placementAsOf', 'units', 'people'}:
            raise ValueError('Invalid metadata')
        from datetime import date
        date.fromisoformat(data['placementAsOf'])
        if not all(isinstance(data[k], str) and data[k] for k in ('source', 'version')):
            raise ValueError('Missing provenance')
        units = {u['id']: u for u in data['units']}
        if len(units) != len(data['units']) or any(set(u) != {'id', 'regionCode', 'label'} or u['regionCode'] not in REGIONS or u['regionCode'] == 'ID' for u in units.values()):
            raise ValueError('Unit identity/mapping invalid')
        import uuid
        if any(not all(isinstance(v, str) and 0 < len(v) <= 200 for v in u.values()) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', u['id']) for u in units.values()):
            raise ValueError('Unit metadata must use bounded strings and URL-safe IDs')
        seen = set()
        for person in data['people']:
            if set(person) - (FIELDS | {'id', 'unitId'}) or person['id'] in seen or person['unitId'] not in units:
                raise ValueError('Unapproved columns or identities')
            if not all(isinstance(v, str) and len(v) <= 200 for v in person.values()):
                raise ValueError('Invalid administrative fields')
            if 'maskedId' in person and not re.fullmatch(r'[A-Za-z-]{0,12}\*{3,}[A-Za-z0-9]{0,4}', person['maskedId']):
                raise ValueError('Only masked internal identifiers allowed')
            if person.get('placementStatus') not in ('ACTIVE', 'INACTIVE'):
                raise ValueError('Invalid status')
            if uuid.UUID(person['id']).version != 4:
                raise ValueError('Person ID must be an opaque UUID v4, never a staffing identifier')
            seen.add(person['id'])
        data['demo'] = False
        return data
    except Exception:
        raise HTTPException(503, 'Sumber personel gagal divalidasi; hubungi pengelola') from None


class PersonnelAccessFilter(logging.Filter):
    def filter(self, record):
        # Search terms and opaque detail IDs must not enter standard HTTP logs.
        # Detail access is audited separately with actor/action/outcome only.
        return '/api/personnel' not in record.getMessage()


def install(app, actor, connection, audit):
    logging.getLogger('uvicorn.access').addFilter(PersonnelAccessFilter())
    def grants(request):
        user = actor(request)
        with connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS personnel_grants(actor TEXT,unit_id TEXT,role TEXT,fields TEXT,PRIMARY KEY(actor,unit_id))')
            rows = db.execute('SELECT unit_id,role,fields FROM personnel_grants WHERE actor=?', (user['id'],)).fetchall()
        try:
            permitted = {r['unit_id']: FIELDS.intersection(json.loads(r['fields'])) for r in rows if r['role'] in ('UNIT_OFFICER', 'SUPERVISOR')}
        except (ValueError, TypeError):
            raise HTTPException(503, 'Konfigurasi izin personel tidak sah') from None
        if not permitted:
            raise HTTPException(403, 'Akses personel tidak diberikan')
        return user, permitted

    def scoped(request, region):
        user, allowed = grants(request)
        if region not in REGIONS:
            raise HTTPException(404, 'Wilayah tidak tersedia')
        data = roster()
        units = [u for u in data['units'] if u['id'] in allowed and (region == 'ID' or u['regionCode'] == region or u['regionCode'].startswith(region + '.'))]
        if not units:
            raise HTTPException(404, 'Wilayah tidak tersedia')
        return user, allowed, data, units

    @app.get('/api/personnel/access')
    def access(request: Request):
        user, allowed = grants(request)
        version = hashlib.sha256(json.dumps([user['id'], sorted((unit, sorted(fields)) for unit, fields in allowed.items())]).encode()).hexdigest()
        return {'authorized': True, 'authorizationVersion': version}

    @app.get('/api/personnel/regions/{region}')
    def summary(region: str, request: Request):
        _, _, data, units = scoped(request, region)
        result = [{**u, 'total': sum(p['unitId'] == u['id'] for p in data['people'])} for u in units]
        return {k: data[k] for k in ('source', 'version', 'placementAsOf', 'demo')} | {'units': result, 'total': sum(u['total'] for u in result)}

    @app.get('/api/personnel/regions/{region}/units/{unit}/people')
    def people(region: str, unit: str, request: Request, q: str = Query('', max_length=100), status: str = Query('', pattern='^(|ACTIVE|INACTIVE)$'), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50)):
        _, allowed, data, units = scoped(request, region)
        if unit not in {u['id'] for u in units}:
            raise HTTPException(404, 'Unit tidak tersedia')
        fields = allowed[unit] - {'administrativeNote'}
        if status and 'placementStatus' not in fields:
            raise HTTPException(403, 'Filter tidak diizinkan')
        rows = [p for p in data['people'] if p['unitId'] == unit and (not status or p['placementStatus'] == status)]
        # Search only returned fields; hidden attributes cannot become an existence oracle.
        rows = [p for p in rows if not q or any(q.casefold() in p.get(f, '').casefold() for f in fields)]
        return {'total': len(rows), 'page': page, 'rows': [{k: p[k] for k in ({'id', 'unitId'} | fields) if k in p} for p in rows[(page-1)*page_size:page*page_size]]}

    @app.get('/api/personnel/regions/{region}/units/{unit}/people/{person_id}')
    def detail(region: str, unit: str, person_id: str, request: Request):
        account = 'anonymous'
        try:
            user = actor(request)
            account = user['id']
            _, allowed, data, units = scoped(request, region)
            if unit not in {u['id'] for u in units}:
                raise HTTPException(404, 'Detail tidak tersedia')
            person = next((p for p in data['people'] if p['id'] == person_id and p['unitId'] == unit), None)
            if not person:
                raise HTTPException(404, 'Detail tidak tersedia')
            result = {k: person[k] for k in ({'id', 'unitId'} | allowed[unit]) if k in person}
        except HTTPException:
            with connection() as db:
                audit(db, account, 'PERSONNEL_DETAIL', {'result': 'DENIED'})
            raise
        with connection() as db:
            audit(db, account, 'PERSONNEL_DETAIL', {'result': 'ALLOWED'})
        return result
