import os
import secrets
import tempfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
PUBLIC_DIR = BASE_DIR / "public"
LOGIN_URL = "/login/"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
    ]},
}]

# Keep the local signing key between restarts and outside version control.
def local_secret():
    path = DATA_DIR / ".django-secret"
    if not path.exists():
        with tempfile.NamedTemporaryFile(dir=DATA_DIR) as tmp:
            tmp.write(secrets.token_urlsafe(64).encode())
            tmp.flush()
            try:
                os.link(tmp.name, path)
            except FileExistsError:
                pass
    return path.read_text()

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or local_secret()
DEBUG = False
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]
CSRF_TRUSTED_ORIGINS = []
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = bool(os.environ.get("CODESPACES"))
if os.environ.get("CODESPACE_NAME"):
    host = "{}-{}.{}".format(os.environ["CODESPACE_NAME"], os.getenv("PORT", "5173"),
                             os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev"))
    ALLOWED_HOSTS.append(host)
    CSRF_TRUSTED_ORIGINS.append("https://" + host)
ROOT_URLCONF = "server.urls"
INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "server"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
DATABASES = {"default": {
    "ENGINE": "django.db.backends.sqlite3",
    "NAME": os.environ.get("SHOP_DATABASE") or DATA_DIR / "shop.sqlite",
    "OPTIONS": {"transaction_mode": "IMMEDIATE", "timeout": 10},
}}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
LANGUAGE_CODE = "ru"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_FAILURE_VIEW = "server.views.csrf_failure"
