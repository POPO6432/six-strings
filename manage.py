import os
import sys
from django.core.management import execute_from_command_line

if __name__ == "__main__":
    # Команды runserver, migrate и test используют настройки магазина.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "server.settings")
    execute_from_command_line(sys.argv)
