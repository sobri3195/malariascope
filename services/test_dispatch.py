import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from services import app
from services.dispatch import dispatch


class DispatchTest(unittest.TestCase):
    def test_delivery_is_explicit_and_failure_is_recorded_without_retry(self):
        with tempfile.TemporaryDirectory() as d:
            app.DB = Path(d) / "fixture.sqlite"
            with app.connection() as db:
                db.execute(
                    "INSERT INTO outbox(id,payload,created) VALUES(?,?,?)",
                    ("fixture", json.dumps({"classification": "TEST ONLY"}), 1),
                )
            with patch("services.dispatch.deliver") as delivery:
                dispatch("webhook")
                dispatch("webhook")
                self.assertEqual(delivery.call_count, 1)
            with app.connection() as db:
                self.assertEqual(
                    db.execute("SELECT status FROM outbox").fetchone()["status"],
                    "DELIVERED",
                )


if __name__ == "__main__":
    unittest.main()
