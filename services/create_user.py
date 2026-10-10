import argparse
import getpass
from services.app import create_user

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("username")
    p.add_argument("--role", choices=["RESEARCHER", "ANALYST", "VIEWER"], required=True)
    a = p.parse_args()
    password = getpass.getpass("Password (12+ characters): ")
    create_user(a.username, password, a.role)
    print("User created. Password is not stored in plaintext.")
