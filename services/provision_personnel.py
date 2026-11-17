"""Operator-only grant provisioning; no HTTP endpoint can grant personnel access."""
import argparse
import json
from services.app import connection
from services.personnel import FIELDS
p = argparse.ArgumentParser()
p.add_argument('account')
p.add_argument('unit')
p.add_argument('--role', choices=['UNIT_OFFICER', 'SUPERVISOR'], required=True)
p.add_argument('--fields', nargs='+', choices=sorted(FIELDS), required=True)
a = p.parse_args()
with connection() as db:
    if not db.execute('SELECT 1 FROM users WHERE id=?', (a.account,)).fetchone():
        raise SystemExit('Account not found')
    db.execute('CREATE TABLE IF NOT EXISTS personnel_grants(actor TEXT,unit_id TEXT,role TEXT,fields TEXT,PRIMARY KEY(actor,unit_id))')
    db.execute('INSERT OR REPLACE INTO personnel_grants VALUES(?,?,?,?)', (a.account,a.unit,a.role,json.dumps(a.fields)))
