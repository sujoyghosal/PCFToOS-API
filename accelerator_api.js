// Loads the configuration from config.env to process.env
const express = require("express");
const mongodb = require("mongodb");
const recordRoutes = express.Router();
const { exec } = require("child_process");
const xl = require('excel4node');
const { exit } = require('process');
var http = require("http");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const excel = require("exceljs");
const PORT = process.env.PORT || 8080;
var eventDocument = null;
const app = express();
var loggedinUsers = [];
var rooms = [];
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
/*
const options = {
  key: fs.readFileSync("server.key"),
  cert: fs.readFileSync("server.cert"),
};*/

app.use(function (err, _req, res, next) {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

let dbConnection;

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri =
  "mongodb+srv://sujoy:EjVe9knedEVhohNJ@cluster0.bk6hekg.mongodb.net/?retryWrites=true&w=majority";
//  "mongodb://mongo-5.concession-kiosk.svc.cluster.local";
//"mongodb://admin:admin@mongo-sujoy-concession-kiosk.pcf-to-ocp-migration-c6c44da74def18a795b07cc32856e138-0000.us-south.containers.appdomain.cloud"
console.log("MongoDB URL=" + uri);
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: false,
  serverApi: ServerApiVersion.v1,
});
client.connect((err) => {
  dbConnection = client.db("PCFToOpenshiftDB");
  //dbConnection = client.db("rhelopenshifttest");
  // perform actions on the collection object
  console.log("Successfully connected to MongoDB - PCFToOpenshiftDB.." + uri);
  //client.close();
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
app.get("/users", (req, res) => {
  console.log("Fetching user for email " + req.query.email);
  dbConnection
    .collection("Users")
    .find({
      email: {
        $eq: req.query.email,
      },
    })
    .limit(50)
    .toArray(function (err, result) {
      if (err) {
        res.status(400).send("Error fetching users!" + err);
      } else {
        res.json(result);
      }
    });
});
app.get("/login", (req, res) => {
  dbConnection
    .collection("Users")
    .find({
      email: {
        $eq: req.query.email,
      },
    })
    .limit(1)
    .toArray(function (err, result) {
      if (err) {
        res.status(400).send("Error fetching user - " + err);
        console.log("Failed login for " + req.query.email + ": " + err);
      } else {
        //res.json(result);
        console.log("Login response: " + JSON.stringify(result));
        if (
          result &&
          result.length > 0 &&
          checkPassword(req.query.password, result[0].pw)
        ) {
          res.status(200).jsonp(result[0]);
          console.log("Success login for " + req.query.email);
          var newUser = result[0];
          var found = false;
          for (i = 0; i < loggedinUsers.length; i++) {
            if (loggedinUsers[i].email == newUser.email) {
              found = true;
              break;
            }
          }
          if (!found) {
            console.log(
              "New User has logged in, refreshing users list with " +
              newUser.name
            );
            loggedinUsers.push(newUser);
          }
          //broadcast event to all loggedin users
          io.emit("new-loggedin-user", {
            newUser: result[0],
          });
        } else {
          res.status(400).send([]);
          console.log("Failed login for " + req.query.email);
        }
      }
    });
});
app.get("/fullscanexcel", (req, res) => {
  generateScanSummaryExcel('/tmp/scan_results.json', req, res)
})

function generateScanSummaryExcel(jsonfile, req, res) {
  const wb = new xl.Workbook();
  const ws = wb.addWorksheet('Scan Data');
  var json = []
  fs.readFile(jsonfile, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return;
    }
    json = JSON.parse(data);
    console.log("Success reading data, length=" + json.length);
    var arr = []
    for (i = 0; i < json.length; i++) {
      var obj = {
        "Scan_ID": JSON.stringify(json[i].scan_id),
        "Time": JSON.stringify(json[i].timestamp).replace(/"/g, ""),
        "Type": JSON.stringify(json[i].type).replace(/"/g, ""),
        "File": JSON.stringify(json[i].file_details.file).replace(/"/g, ""),
        "Dependencies": JSON.stringify(json[i].file_details.dependencies).replace(/"/g, ""),
        "User_Defined_Env_Vars": JSON.stringify(json[i].file_details.env_vars[0]),
        "VCAP_Env_Vars": JSON.stringify(json[i].file_details.vcap_env_vars),
        "App_Name": JSON.stringify(json[i].manifest.applications[0].name).replace(/"/g, ""),
        "Memory": JSON.stringify(json[i].manifest.applications[0].memory).replace(/"/g, ""),
        "Instances": JSON.stringify(json[i].manifest.applications[0].instances).replace(/"/g, ""),
        "Disk_Quota": JSON.stringify(json[i].manifest.applications[0].disk_quota).replace(/"/g, ""),
        "Buildpacks": JSON.stringify(json[i].manifest.applications[0].buildpacks).replace(/"/g, ""),
        "Log_Rate_Limit": JSON.stringify(json[i].manifest.applications[0]['log-rate-limit']).replace(/"/g, ""),
        "App_Env_Vars": JSON.stringify(json[i].manifest.applications[0].env),
        "Routes": JSON.stringify(json[i].manifest.applications[0].routes)
      }
      arr.push(obj);
    }
    console.log("Array Length = " + arr.length);
    const headingColumnNames = [
      "Scan ID",
      "Date",
      "Type",
      "File Name",
      "Dependencies",
      "User Defined Env Vars",
      "System (VCAP) Env Vars",
      "App Name",
      "Memory",
      "Instances",
      "Disk Quota",
      "Buildpacks",
      "Log Rate Limit",
      "Manifest Env Variables",
      "Routes"
    ];
    //Write Column Title in Excel file
    let headingColumnIndex = 1;
    headingColumnNames.forEach(heading => {
      ws.cell(1, headingColumnIndex++)
        .string(heading)
    });
    //Write Data in Excel file
    let rowIndex = 2;
    arr.forEach(record => {
      let columnIndex = 1;
      Object.keys(record).forEach(columnName => {
        ws.cell(rowIndex, columnIndex++)
          .string(record[columnName])
      });
      rowIndex++;
    });
    console.log("Sending data.xls to web client..")
    wb.write('data.xls');
    wb.write('data.xls', res);

    //res.setHeader("Content-Disposition", "attachment; filename=" + '/Users/Sujoy.Ghosal/apps/PCFToOS-API2/data.xlsx');
  });
  //res.setHeader("Content-Type", "application/vnd.ms-excel");
  /*res.writeHead(200, {
    'Content-Type': 'application/vnd.ms-excel',
    'Content-Length': fs.statSync('data.xls').size
  });
  var readStream = fs.createReadStream('data.xls');
  // We replaced all the event handlers with a simple call to readStream.pipe()
  readStream.pipe(res);*/
}
function generateQueryFilteredExcel(jsonfile, req, res) {
  const wb = new xl.Workbook();
  const ws = wb.addWorksheet('Scan Data');
  var json = []
  fs.readFile(jsonfile, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return;
    }
    json = JSON.parse(data);
    console.log("Success reading data, length=" + json.length);
    var arr = []
    for (i = 0; i < json.length; i++) {
      console.log(JSON.stringify(json[i]));
      var obj = {
        "Scan_ID": JSON.stringify(json[i].scan_id),
        "Time": JSON.stringify(json[i].time_created).replace(/"/g, ""),
        "Type": JSON.stringify(json[i].file_type).replace(/"/g, ""),
        "File": JSON.stringify(json[i].file_details.file).replace(/"/g, ""),
        "Dependencies": JSON.stringify(json[i].file_details.dependencies).replace(/"/g, ""),
        "User_Defined_Env_Vars": JSON.stringify(json[i].file_details.env_vars[0]),
        "VCAP_Env_Vars": JSON.stringify(json[i].file_details.vcap_env_vars),
        "App_Name": JSON.stringify(json[i].manifest.applications[0].name).replace(/"/g, ""),
        "Memory": JSON.stringify(json[i].manifest.applications[0].memory).replace(/"/g, ""),
        "Instances": JSON.stringify(json[i].manifest.applications[0].instances).replace(/"/g, ""),
        "Disk_Quota": JSON.stringify(json[i].manifest.applications[0].disk_quota).replace(/"/g, ""),
        "Buildpacks": JSON.stringify(json[i].manifest.applications[0].buildpacks).replace(/"/g, ""),
        "Log_Rate_Limit": JSON.stringify(json[i].manifest.applications[0]['log-rate-limit']).replace(/"/g, ""),
        "App_Env_Vars": JSON.stringify(json[i].manifest.applications[0].env),
        "Routes": JSON.stringify(json[i].manifest.applications[0].routes)
      }
      arr.push(obj);
    }
    console.log("Array Length = " + arr.length);
    const headingColumnNames = [
      "Scan ID",
      "Date",
      "Type",
      "File Name",
      "Dependencies",
      "User Defined Env Vars",
      "System (VCAP) Env Vars",
      "App Name",
      "Memory",
      "Instances",
      "Disk Quota",
      "Buildpacks",
      "Log Rate Limit",
      "Application Env Variables",
      "Routes"
    ];
    //Write Column Title in Excel file
    let headingColumnIndex = 1;
    headingColumnNames.forEach(heading => {
      ws.cell(1, headingColumnIndex++)
        .string(heading)
    });
    //Write Data in Excel file
    let rowIndex = 2;
    arr.forEach(record => {
      let columnIndex = 1;
      Object.keys(record).forEach(columnName => {
        ws.cell(rowIndex, columnIndex++)
          .string(record[columnName])
      });
      rowIndex++;
    });
    console.log("Sending data.xls to web client..")
    wb.write('/tmp/data.xls');
    wb.write('/tmp/data.xls', res);

    //res.setHeader("Content-Disposition", "attachment; filename=" + '/Users/Sujoy.Ghosal/apps/PCFToOS-API2/data.xlsx');
  });
  //res.setHeader("Content-Type", "application/vnd.ms-excel");
  /*res.writeHead(200, {
    'Content-Type': 'application/vnd.ms-excel',
    'Content-Length': fs.statSync('data.xls').size
  });
  var readStream = fs.createReadStream('data.xls');
  // We replaced all the event handlers with a simple call to readStream.pipe()
  readStream.pipe(res);*/
}
async function getUserByEmail(email) {
  if (!email || email == null || email.length < 3) {
    console.log("GetUserByEmail: Not a valid email");
    return;
  }
  dbConnection
    .collection("User")
    .find({
      email: {
        $eq: email,
      },
    })
    .limit(1)
    .toArray(function (err, result) {
      if (err) {
        console.log("Error fetching user!" + err);
        return null;
      } else {
        //res.json(result);
        if (result && result.length > 0) {
          console.log("Email already exists " + result[0]);
          return true;
        } else return false;
      }
    });
}
var bcrypt = require("bcrypt");
const { response } = require("express");
const { stringify } = require("querystring");
var encryptedPw = "null";

function encryptPassword(password) {
  const saltRounds = 10;
  const myPlaintextPassword = password;
  var salt = bcrypt.genSaltSync(saltRounds);
  var hash = bcrypt.hashSync(myPlaintextPassword, salt);
  encryptedPw = hash;
  console.log("Encrypted password=" + hash);
  return hash;
}

function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
  //return true;
}

// This section will help you create a new record.
app.post("/users/insert", (req, res) => {
  var email = req.body.email;
  if (!email || email == null || email.length < 3) {
    console.log("Not a valid email");
    return;
  }
  console.log(JSON.stringify(req.body));
  dbConnection
    .collection("Users")
    .find({
      email: {
        $eq: email,
      },
    })
    .limit(1)
    .toArray(function (err, result) {
      if (err) {
        console.log("Error fetching user!" + err);
        return null;
      } else {
        //res.json(result);
        if (result && result.length > 0) {
          console.log("Email already exists " + JSON.stringify(result[0]));
          res.status(400).send("Email Exists");
          return;
        } else {
          encryptedPw = encryptPassword(req.body.password);
          const userDocument = {
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone,
            //address: req.body.address,
            pw: encryptedPw,
            ngo: req.body.ngo ? req.body.ngo : false,
            create_time: new Date(),
          };

          dbConnection
            .collection("Users")
            .insertOne(userDocument, function (err, result) {
              if (err) {
                console.error(JSON.stringify(err));
                res.status(400).send("Error inserting user data!");
              } else {
                console.log(`Added a new user with id ${result.insertedId}`);
                res.status(201).send("Success");
              }
            });
        }
      }
    });
});

// This section will help you update a record by id.
app.put("/users/update"),
  (req, res) => {
    const userUpdateQuery = {
      _id: new mongodb.ObjectID(req.body.userID),
    };
    encryptedPw = encryptPassword(req.body.password);
    const updates = {
      $set: {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone_number,
        address: req.body.address,
        pw: encryptedPw,
        ngo: req.body.ngo ? req.body.ngo : false,
        create_time: new Date(),
      },
    };

    dbConnection
      .collection("Users")
      .updateOne(userUpdateQuery, updates, function (err, _result) {
        if (err) {
          console.error(JSON.stringify(err));
          res
            .status(400)
            .send(`Error updating user id ${userUpdateQuery._id}!`);
        } else {
          console.log("1 document updated");
          res.status(200).send("Success");
        }
      });
  };
app.put("/subscribe_events", (req, res) => {
  console.log(
    "Received new subscribe events request " + JSON.stringify(req.body.events)
  );
  var lng;
  var lat;
  var max_dist;
  if (req.body.event_receive_location) {
    max_dist = req.body.event_receive_location.max_distance;
    lng = req.body.event_receive_location.lng;
    lat = req.body.event_receive_location.lat;
  } else {
    lng = null;
    lat = null;
    max_dist = null;
  }
  const subscribeEventsQuery = {
    _id: new mongodb.ObjectID(req.body.user_id),
  };
  const updates = {
    $set: {
      subscribed_events: req.body.events,
      event_receive_location: {
        type: "Point",
        coordinates: [lng, lat],
      },
      event_receive_max_distance: max_dist,
      last_modified_time: new Date().toLocaleString(),
    },
  };

  dbConnection
    .collection("Users")
    .updateOne(subscribeEventsQuery, updates, function (err, _result) {
      if (err) {
        console.error(JSON.stringify(err));
        res
          .status(400)
          .send(`Error updating user id ${subscribeEventsQuery._id}!`);
      } else {
        console.log("1 document updated");
        res.status(200).send("Success");
      }
    });
});
// This section will help you delete a record
app.delete("/users/delete", (req, res) => {
  console.log("Received delete request for cust id " + req.body.userID);
  const custQuery = {
    userID: req.body.userID,
  };

  dbConnection.collection("User").deleteOne(custQuery, function (err, _result) {
    if (err) {
      res.status(400).send(`Error deleting user with id ${custQuery.userID}!`);
    } else {
      console.log("1 document deleted");
      res.status(200).send();
    }
  });
});

//getEvents by email
app.get("/eventsbyemailandtype", (req, res) => {
  dbConnection
    .collection("Events")
    .find({
      email: {
        $eq: req.query.email,
      },
      event_type: req.query.type,
    })
    .limit(1000)
    .toArray(function (err, result) {
      if (err) {
        console.log(
          "eventsbyemailandtype - Failed to fetch events for " +
          req.query.email +
          ", error " +
          err
        );
        res.status(400).send("Error fetching Events!" + err);
      } else {
        //res.json(result);
        if (result && result.length > 0) {
          res.status(200).jsonp(result);
          console.log(
            "eventsbyemailandtype - Success fetching events for " +
            req.query.email
          );
        } else {
          res.status(200).send([]);
          console.log("No Events for " + req.query.email);
        }
      }
    });
});
app.post("/new-scan-started", (req, res) => {
  console.log("Got new scan started event from discovery script...");
  console.log("Notifying to all connected browsers");
  //io.sockets.in(channel).emit("new-scan", {

  io.local.emit("new-event", {
    message: "Streaming Scan data to follow..."
  });
  res.send("Success Notifying New Scan Event to clients!")
});
//Create Event
app.post("/events/insert", (req, res) => {
  console.log("Received array " + JSON.stringify(req.body));
  eventDocument = {
    scan_id: req.body.scan_id,
    time_created: req.body.timestamp,
    event_type: "top level scan",
    file_type: req.body.type,
    total_files: req.body.total_files,
    file_number: req.body.file_number,
    file_details: req.body.file_details,
    manifest: req.body.manifest,
    packagejson: req.body.packagejson
  };
  createEvent(eventDocument, req, res);
});

//Create Event
//app.post("/events/insert", (req, res) => {
function createEvent(obj, req, res) {
  //console.log("Event document = " + JSON.stringify(obj));
  console.log("Sending event to all connected browsers..event id=" + obj.scan_id);
  //io.sockets.in(channel).emit("new-scan", {

  io.local.emit("new-scan", {
    event_id: obj.scan_id,
    eventDetails: obj,
  });
  dbConnection.collection("Events").insertOne(obj, function (err, result) {
    if (err) {
      console.error(JSON.stringify(err));
      res.status(401).send(err);
    } else {
      console.log(`Added a new event to DB with id ${result.insertedId}`);

      res.status(200).send("Success");
    }
  });
  //dbConnection.collection("Events").createIndex({ location: "2dsphere" });
  /*const eventsCollection = dbConnection.collection("Events");
  const result = eventsCollection.createIndex({ location: "2dsphere" });*/
  //console.log(`Index created: ${result}`);
}
//Get Events By Subscription

app.get("/fetchevents", (req, res) => {
  console.log("FetchEvents Call...");

  dbConnection
    .collection("Events")
    .find({
      file_type: {
        //$in: req.body.scan_id,
        //$in: [29233],
        $eq: "javascript",
      },
    })
    .limit(200)
    .toArray(function (err, result) {
      if (err) {
        console.log("Failed to fetch event  " + err);
        res.status(404).send("No events");
      } else {
        //res.json(result);
        console.log("Success Calling fetch events");
        if (result && result.length > 0) {
          res.status(200).jsonp(result);
        } else {
          res.status(404).send("No Events");
          console.log("No events");
        }
      }
    });
});
//Neaby Events for my subscribed geo location options
app.get("/topscan", (req, res) => {
  console.log("received top level scan request from " + req.query.email);
  console.log("Response: " + JSON.stringify(eventDocument));
  res.jsonp(eventDocument);
});

app.get("/getEventsForInstances", (req, res) => {
  console.log("getEventsForInstances Call for scan id = " + req.query.scan_id);
  var type = req.query.type;
  if (!type || type.length == 0) {
    console.log("No type value found in request - setting to default very high");
    type = "vh";
  }
  var threshold_low = 0;
  var threshold_high = 0;
  switch (type) {
    case "n":
      threshold_low = 0;
      threshold_high = 2;
      break;
    case "mh":
      threshold_low = 2;
      threshold_high = 4;
      break;
    case "h":
      threshold_low = 4;
      threshold_high = 6;
      break;
    case "vh":
      threshold_low = 6;
      threshold_high = 4000;
      break;
  }
  dbConnection
    .collection("Events")
    .find({
      scan_id: Number.parseInt(req.query.scan_id),
      'manifest.applications.0.instances': { $gt: threshold_low, $lte: threshold_high }
    })
    .limit(20000)
    .toArray(function (err, result) {
      if (err) {
        console.log("Failed getEventsForInstances  " + err);
        res.status(404).send("No events");
      } else {
        //res.json(result);
        console.log("Success Calling fetch events");
        if (result && result.length > 0) {
          var options = { flag: 'w' };
          fs.writeFile('/tmp/instances.json', JSON.stringify(result), options, err => {
            if (err) {
              console.error(err);
            }
            console.log("Created file...");
            generateQueryFilteredExcel('/tmp/instances.json', req, res);
          });
          //res.status(200).jsonp(result);
        } else {
          //res.status(404).send("No Events");
          console.log("No events");
        }
      }
    });
});

app.get("/getEventsForMemory", (req, res) => {
  console.log("getEventsForMemory Call for scan id = " + req.query.scan_id);
  var type = req.query.type;
  if (!type || type.length == 0) {
    console.log("No type value found in request - setting to default very high");
    type = "vh";
  }
  var threshold_low = 0;
  var threshold_high = 0;
  switch (type) {
    case "n":
      threshold_low = 0;
      threshold_high = 256;
      break;
    case "mh":
      threshold_low = 256;
      threshold_high = 512;
      break;
    case "h":
      threshold_low = 512;
      threshold_high = 1024;
      break;
    case "vh":
      threshold_low = 1024;
      threshold_high = 5000;
      break;
  }
  dbConnection
    .collection("Events")
    .find({
      scan_id: Number.parseInt(req.query.scan_id),
      //'manifest.applications.0.memory': { $gt: 1024 }
    })
    .limit(5000)
    .toArray(function (err, result) {
      if (err) {
        console.log("Failed getEventsForMemory  " + err);
        res.status(404).send("No events");
      } else {
        //res.json(result);
        console.log("Success Calling fetch events");
        if (result && result.length > 0) {
          var m_array = [];
          for (i = 0; i < result.length; i++) {
            var m = result[i].manifest.applications[0].memory.replace(/\D/g, '');
            if (m > threshold_low && m <= threshold_high) {
              m_array.push(result[i]);
            }
          }
          console.log("Found " + m_array.length + " projects with " + type + " type memory values in manifest.yaml.");
          var options = { flag: 'w' };
          fs.writeFile('/tmp/memory.json', JSON.stringify(m_array), options, err => {
            if (err) {
              console.error(err);
            }
            console.log("Created file...");
            generateQueryFilteredExcel('/tmp/memory.json', req, res);
          });
          //res.status(200).jsonp(result);
        } else {
          //res.status(404).send("No Events");
          console.log("No events");
        }
      }
    });
});
function runShellScript(command) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
}
//Event Update
app.put("/events/update", (req, res) => {
  const eventUpdateQuery = {
    _id: new mongodb.ObjectID(req.body.eventID),
  };
  console.log("Event update query body: " + JSON.stringify(req.body));
  const updates = {
    $set: {
      event_type: req.body.event_type,
      event_name: req.body.event_name,
      city: req.body.city,
      item_category: req.body.item_category,
      item_name: req.body.item_name,
      time_created: Date().toString(),
    },
  };

  dbConnection
    .collection("Events")
    .updateOne(eventUpdateQuery, updates, function (err, _result) {
      if (err) {
        console.error(JSON.stringify(err));
        res.status(400).send(`Error updating user id ${eventUpdateQuery._id}!`);
      } else {
        console.log("1 document updated");
        res.status(200).send("Success");
      }
    });
});
//Cancel Event
app.delete("/events/delete", (req, res) => {
  console.log("Received delete request for event id " + req.body.eventID);
  const query = {
    _id: new mongodb.ObjectID(req.body.eventID),
  };

  dbConnection.collection("Events").deleteOne(query, function (err, _result) {
    if (err) {
      res.status(400).send(`Error deleting event with id ${req.body.eventID}!`);
    } else {
      console.log("1 document deleted");
      res.status(200).send("Success");
    }
  });
});

//Create Subscription
app.post("/subscriptions/insert", (req, res) => {
  console.log("Subscription document = " + JSON.stringify(req.body));
  const subscriptionDocument = {
    user_id: req.body.user_id,
    email: req.body.email,
    subscribed_events: req.body.events,
    time_created: Date().toString(),
  };
  dbConnection
    .collection("Subscriptions")
    .insertOne(subscriptionDocument, function (err, result) {
      if (err) {
        console.error(JSON.stringify(err));
        res.status(400).send("Error inserting subscriptionDocument data!");
      } else {
        console.log(`Added a new subscription with id ${result.insertedId}`);
        res.status(201).send("Success");
      }
    });
});
//Subscriptions Update
app.put("/subscriptions/update", (req, res) => {
  const subscriptionsUpdateQuery = {
    _id: new mongodb.ObjectID(req.body.subscriptionID),
  };
  const updates = {
    $set: {
      user_id: req.body.user_id,
      email: req.body.email,
      subscribed_events: req.body.subscribed_events,
      time_created: Date().toString(),
    },
  };

  dbConnection
    .collection("Subscriptions")
    .updateOne(subscriptionsUpdateQuery, updates, function (err, _result) {
      if (err) {
        console.error(JSON.stringify(err));
        res
          .status(400)
          .send(`Error updating user id ${subscriptionsUpdateQuery._id}!`);
      } else {
        console.log("1 document updated");
        res.status(200).send("Success");
      }
    });
});
//Cancel Event
app.delete("/subscriptions/delete", (req, res) => {
  console.log(
    "Received delete request for subscription id " + req.body.subscriptionID
  );
  const query = {
    _id: new mongodb.ObjectID(req.body.subscriptionID),
  };

  dbConnection
    .collection("Subscriptions")
    .deleteOne(query, function (err, _result) {
      if (err) {
        res
          .status(400)
          .send(
            `Error deleting subscription with id ${req.body.subscriptionID}!`
          );
      } else {
        console.log("1 document deleted");
        res.status(200).send("Success");
      }
    });
});
//module.exports = recordRoutes;
// Listen for requests until the server is stopped

//app.use(cors());
var whitelist = [
  "http://localhost:3000",
  "http://localhost:8080",
  "https://pcf-to-os-web-concession-kiosk.pcf-to-ocp-migration-c6c44da74def18a795b07cc32856e138-0000.us-south.containers.appdomain.cloud",
];
app.use(
  cors({
    origin: whitelist,
  })
);

const httpServer = http.createServer(app).listen(PORT, function (req, res) {
  console.log("listening on *:" + PORT);
});
const io = require("socket.io")(httpServer, {
  cors: {
    //origin: "http://localhost:3000",
    origin: whitelist,
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
  allowEIO3: true,
});
var mysocket = null;

io.on("connection", function (socket) {
  mysocket = socket;
  console.log("a user connected");
  mysocket.emit("event", { lang: "en-US", text: "Today is a beautiful day" });
  socket.on("create-room", function (room) {
    if (room) {
      socket.join(room.channel);
      rooms.push(room.channel);
      console.log("Joined client socket to room " + room.channel);
    }
  });
  socket.on("send-login", function (userInfo) {
    mysocket.emit("loggedin-users", {
      currentUsers: loggedinUsers,
    });
  });
  socket.on("leave", function (room) {
    console.log("#####Disconecting client socket from room " + room.channel);
    socket.leave(room.channel);
    rooms.pop(room.channel);
  });
});
