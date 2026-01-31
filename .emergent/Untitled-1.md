hosting application in production:


service.md file in etc/systemd/system for configitnbackedn server 
[Unit]
Description=circulum customisation API
After=network.target

[Service]
User=root
WorkingDirectory=/opt/curriculum-customisation/rhymes-app/backend
Environment=GOOGLE_APPLICATION_CREDENTIALS=/opt/curriculum-customisation/rhymes-app/backend/secure/firebase_key.json
ExecStart=/opt/curriculum-customisation/rhymes-app/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target

to edit service

to check the erros crashing server.
systemctl status rhymes-api.service --no-pager
journalctl -u rhymes-api.service -n 50 --no-pager


Edplore.org@2025

