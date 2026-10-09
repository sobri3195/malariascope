import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from services import app as service
from services.scheduler import evaluate_records, tick


class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        service.DB = Path(self.temp.name) / "test.sqlite"
        service.attempts.clear()
        service.create_user("analyst", "fixture-password-123", "ANALYST")
        service.create_user("viewer", "fixture-password-123", "VIEWER")
        self.client = TestClient(service.app, base_url="https://testserver")
        self.csrf = self.client.post(
            "/api/login", json=dict(username="analyst", password="fixture-password-123")
        ).json()["csrf"]
        self.headers = {"X-CSRF-Token": self.csrf}

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def test_authenticated_revision_conflicts_and_server_audit(self):
        a = self.client.put(
            "/api/workspace",
            json=dict(expectedRevision=0, workspace=dict(datasets=[])),
            headers=self.headers,
        )
        self.assertEqual(a.status_code, 200)
        self.assertEqual(
            self.client.put(
                "/api/workspace",
                json=dict(expectedRevision=0, workspace=dict(datasets=[])),
                headers=self.headers,
            ).status_code,
            409,
        )
        self.assertEqual(
            self.client.put(
                "/api/workspace",
                json=dict(expectedRevision=1, workspace=dict(datasets=[])),
            ).status_code,
            403,
        )
        self.assertEqual(len(self.client.get("/api/revisions").json()), 1)
        self.assertEqual(
            self.client.get("/api/revisions/1").json()["workspace"]["datasets"], []
        )
        self.assertTrue(
            any(
                r["event"] == "WORKSPACE_SAVED"
                for r in self.client.get("/api/audit").json()
            )
        )

    def test_backup_restore_preserves_shared_revision_and_audit(self):
        self.client.put(
            "/api/workspace",
            json=dict(expectedRevision=0, workspace=dict(datasets=[], name="retained")),
            headers=self.headers,
        )
        backup = Path(self.temp.name) / "backup.sqlite"
        env = dict(os.environ, MALARIASCOPE_DB=str(service.DB))
        subprocess.run(
            [sys.executable, "-m", "services.backup", str(backup)],
            env=env,
            check=True,
            capture_output=True,
        )
        refused = subprocess.run(
            [sys.executable, "-m", "services.backup", str(backup)],
            env=env,
            capture_output=True,
        )
        self.assertNotEqual(refused.returncode, 0)
        restored = Path(self.temp.name) / "restored.sqlite"
        shutil.copyfile(backup, restored)
        service.DB = restored
        with service.connection() as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(
                db.execute(
                    "SELECT revision FROM workspace WHERE id='shared'"
                ).fetchone()[0],
                1,
            )
            self.assertEqual(
                db.execute(
                    "SELECT count(*) FROM audit WHERE event='WORKSPACE_SAVED'"
                ).fetchone()[0],
                1,
            )
        self.assertEqual(
            self.client.get("/api/workspace").json()["workspace"]["name"], "retained"
        )

    def test_viewer_cannot_write_or_register(self):
        r = self.client.post(
            "/api/login", json=dict(username="viewer", password="fixture-password-123")
        )
        headers = {"X-CSRF-Token": r.json()["csrf"]}
        self.assertEqual(
            self.client.put(
                "/api/workspace",
                json=dict(expectedRevision=0, workspace=dict(datasets=[])),
                headers=headers,
            ).status_code,
            403,
        )

    def test_scheduler_suppression_is_durable(self):
        rows = [
            dict(
                district="Fixture",
                period=p,
                source="Test only",
                metrics=dict(cases=200),
            )
            for p in ["2025-01", "2025-02", "2025-03"]
        ]
        c = dict(metric="cases", operator=">", value=100)
        self.assertEqual(len(evaluate_records(rows, c, "monthly", 2, True)), 1)
        self.assertEqual(
            self.client.post(
                "/api/jobs",
                json=dict(id="fixture", records=rows, expression=c, persistence=2),
                headers=self.headers,
            ).status_code,
            200,
        )
        tick()
        tick()
        self.assertEqual(len(self.client.get("/api/notifications").json()), 1)

    def test_prospective_registration_requires_future_period(self):
        import time

        now = time.time()
        record = dict(
            district="Fixture",
            model="RF",
            model_version="v1",
            target_start=now + 1000,
            target_end=now + 2000,
            data_cutoff=now - 100,
            prediction=123,
            dataset_hash="a" * 64,
        )
        r = self.client.post("/api/forecasts", json=record, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/forecasts/" + r.json()["id"] + "/outcome",
                json={"outcome": 110},
                headers=self.headers,
            ).status_code,
            409,
        )
        self.assertEqual(
            self.client.post(
                "/api/forecasts",
                json=record | dict(target_start=now - 50),
                headers=self.headers,
            ).status_code,
            422,
        )

    def test_cross_origin_and_unsigned_access_are_rejected(self):
        self.assertEqual(
            self.client.post(
                "/api/login",
                json=dict(username="analyst", password="fixture-password-123"),
                headers={"Origin": "https://untrusted.example"},
            ).status_code,
            403,
        )
        with TestClient(service.app) as anonymous:
            self.assertEqual(anonymous.get("/api/workspace").status_code, 401)


if __name__ == "__main__":
    unittest.main()
