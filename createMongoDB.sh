#oc new-app -e MONGODB_USER=admin -e MONGODB_PASSWORD=admin -e MONGODB_DATABASE=PCFToOpenshiftDB -e MONGODB_ADMIN_PASSWORD=admin mongo:latest
show dbs;
use PCFToOpenshiftDB;
db.Users.insert({
    "email": "joyitas@gmail.com",
    "name": "Tester2",
    "phone": "8443234133432",
    "password": "abc123",
    "ngo": false
})
