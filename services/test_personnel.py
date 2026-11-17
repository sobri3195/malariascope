import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from services import app as service


class PersonnelTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous = service.DB
        service.DB = Path(self.temp.name) / 'test.sqlite'
        self.env = patch.dict(os.environ, {'MALARIASCOPE_PERSONNEL_DEMO': '1', 'MALARIASCOPE_ROSTER_FILE': ''})
        self.env.start()
        self.client = TestClient(service.app, base_url='https://testserver')
        service.attempts.clear()
        for user in ('officer', 'supervisor', 'public'):
            service.create_user(user, 'fixture-password-123', 'ANALYST')
        with service.connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS personnel_grants(actor TEXT,unit_id TEXT,role TEXT,fields TEXT,PRIMARY KEY(actor,unit_id))')
            for user, units in [('officer', ['demo-aceh']), ('supervisor', ['demo-aceh', 'demo-jakarta'])]:
                for unit in units:
                    db.execute('INSERT INTO personnel_grants VALUES(?,?,?,?)',(user, unit, 'UNIT_OFFICER' if user=='officer' else 'SUPERVISOR', json.dumps(['name','maskedId','placementStatus'])))

    def tearDown(self):
        self.client.close()
        self.env.stop()
        service.DB = self.previous
        self.temp.cleanup()

    def login(self, user):
        self.assertEqual(self.client.post('/api/login', json={'username':user,'password':'fixture-password-123'}).status_code, 200)

    def test_scopes_projection_search_pagination_detail_and_audit(self):
        self.login('officer')
        summary = self.client.get('/api/personnel/regions/ID')
        self.assertEqual(summary.headers['cache-control'], 'no-store')
        self.assertEqual(summary.json()['total'],4)
        self.assertEqual(len(summary.json()['units']),1)
        self.assertNotIn('jakarta', summary.text.lower())
        for path in ['regions/31','regions/31.01','regions/11.03/units/demo-jakarta/people','regions/11.03/units/demo-aceh/people/demo-7','regions/31.01/units/demo-jakarta/people/demo-7']:
            response = self.client.get('/api/personnel/'+path)
            self.assertEqual(response.status_code,404,path)
            self.assertEqual(response.headers['cache-control'],'no-store')
        base='/api/personnel/regions/11.03/units/demo-aceh/people'
        listing=self.client.get(base+'?page_size=1&page=2').json()
        self.assertEqual(listing['total'],4)
        self.assertEqual(len(listing['rows']),1)
        person=listing['rows'][0]
        self.assertNotIn('role',person)
        self.assertNotIn('administrativeNote',person)
        self.assertEqual(self.client.get(base+'?q=Administrasi').json()['total'],0)
        detail=self.client.get(base+'/'+person['id'])
        self.assertEqual(set(detail.json()), {'id','unitId','name','maskedId','placementStatus'})
        self.assertEqual(detail.headers['cache-control'],'no-store')
        with service.connection() as db:
            logs=[dict(r) for r in db.execute("SELECT * FROM audit WHERE event='PERSONNEL_DETAIL'")]
        self.assertTrue(any('ALLOWED' in r['details'] for r in logs))
        self.assertTrue(any('DENIED' in r['details'] for r in logs))
        self.assertNotIn('Personel Sintetis',json.dumps(logs))

    def test_expiry_public_revocation_and_disconnected_source(self):
        self.assertEqual(self.client.get('/api/personnel/access').status_code,401)
        self.login('public')
        self.assertEqual(self.client.get('/api/personnel/access').status_code,403)
        self.login('supervisor')
        self.assertEqual(self.client.get('/api/personnel/regions/ID').json()['total'],7)
        with patch.dict(os.environ, {'MALARIASCOPE_PERSONNEL_DEMO':'0'}):
            self.assertEqual(self.client.get('/api/personnel/regions/ID').status_code,503)
        with service.connection() as db: db.execute('UPDATE sessions SET expires=0')
        self.assertEqual(self.client.get('/api/personnel/regions/ID').status_code,401)

    def test_roster_rejects_sensitive_columns_and_checkout_files(self):
        self.login('officer')
        file=Path(self.temp.name)/'roster.json'
        file.write_text(json.dumps({'source':'approved','version':'1','placementAsOf':'2026-11-17','units':[{'id':'demo-aceh','regionCode':'11.03','label':'Unit'}],'people':[{'id':'a','unitId':'demo-aceh','diagnosis':'forbidden'}]}))
        with patch.dict(os.environ, {'MALARIASCOPE_ROSTER_FILE':str(file)}):
            self.assertEqual(self.client.get('/api/personnel/regions/ID').status_code,503)
        invalid_unit={'source':'approved','version':'fixture','placementAsOf':'2026-11-17','units':[{'id':'demo-aceh','regionCode':'11.03','label':{'bad':'shape'}}],'people':[]}
        file.write_text(json.dumps(invalid_unit))
        with patch.dict(os.environ, {'MALARIASCOPE_ROSTER_FILE':str(file)}):
            self.assertEqual(self.client.get('/api/personnel/regions/ID').status_code,503)
        with patch.dict(os.environ, {'MALARIASCOPE_ROSTER_FILE':str(Path(__file__).resolve())}):
            self.assertEqual(self.client.get('/api/personnel/regions/ID').status_code,503)

    def test_valid_private_adapter_and_field_scoped_filter(self):
        import uuid
        self.login('officer')
        file=Path(self.temp.name)/'approved.json'
        pid=str(uuid.uuid4())
        file.write_text(json.dumps({'source':'Approved test-only adapter','version':'fixture-v1','placementAsOf':'2026-11-17','units':[{'id':'demo-aceh','regionCode':'11.03','label':'Fixture Unit'}],'people':[{'id':pid,'unitId':'demo-aceh','name':'Synthetic approved fixture','maskedId':'TEST-***1','placementStatus':'ACTIVE','role':'Hidden role'}]}))
        with patch.dict(os.environ, {'MALARIASCOPE_ROSTER_FILE':str(file)}):
            result=self.client.get('/api/personnel/regions/11.03/units/demo-aceh/people/'+pid)
            self.assertEqual(result.status_code,200)
            self.assertNotIn('role',result.json())
            self.assertEqual(result.json()['maskedId'],'TEST-***1')
        before=self.client.get('/api/personnel/access').json()['authorizationVersion']
        with service.connection() as db:
            db.execute('UPDATE personnel_grants SET fields=? WHERE actor=?',(json.dumps(['name']),'officer'))
        self.assertNotEqual(self.client.get('/api/personnel/access').json()['authorizationVersion'],before)
        self.assertEqual(self.client.get('/api/personnel/regions/11.03/units/demo-aceh/people?status=ACTIVE').status_code,403)

    def test_http_access_log_filter_drops_personnel_search_terms(self):
        import logging
        from services.personnel import PersonnelAccessFilter
        record=logging.LogRecord('uvicorn.access',logging.INFO,'',0,'GET %s',('/api/personnel/regions/ID?q=Sensitive-Name',),None)
        self.assertFalse(PersonnelAccessFilter().filter(record))
        ordinary=logging.LogRecord('uvicorn.access',logging.INFO,'',0,'GET /api/health',(),None)
        self.assertTrue(PersonnelAccessFilter().filter(ordinary))
