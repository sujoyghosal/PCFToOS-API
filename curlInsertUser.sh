curl --location 'https://pcf-to-os-api-git-concession-kiosk.pcf-to-ocp-migration-c6c44da74def18a795b07cc32856e138-0000.us-south.containers.appdomain.cloud:8080/users/insert' \
--header 'Content-Type: application/json' \
--data-raw '{
    "email": "m_ahmed2@gmail.com",
    "name": "Tester2",
    "phone": "8443234133432",
    "password": "abc123",
    "ngo": false
}'
