import * as functions from 'firebase-functions';

const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
admin.initializeApp();

const app = express();

app.use(cors({ origin: true }));

app.post('/registerToken', async (req : any, res : any) => {
    const fcmToken = required(req.body,'fcmToken');
    const deviceId = required(req.body,'deviceId');
    const createdAt = required(req.body,'createdAt');
    const phone = required(req.body, 'phone');
    const deviceModel = required(req.body,'deviceModel');
    const appVersion = required(req.body,'appVersion');
    try {
        return addToken({ fcmToken, deviceId, phone, deviceModel, createdAt, appVersion }).then((value: any) => {res.status(200).send();});
    }
    catch (error) {
        res.status(400).send(JSON.stringify(error));
    }
  });

  app.post('/deRegisterToken', async (req : any, res : any) => {
    const phone = required(req.body, 'phone');
    try {
        return deleteToken({ phone }).then((value: any) => {res.status(200).send();});
    } catch (error) {
        res.status(400).send(JSON.stringify(error));
    }
  });

  app.post('/sendPushNotification', async (req : any, res : any) => {
    //data from request body
    const phone = required(req.body,'phone');
    const title = required(req.body,'title');
    const body = required(req.body,'body');
    try {
        return sendPushNotificationToDevice({ phone, title, body }).then((value: any) => {res.status(200).send();});
    } catch (error) {
        res.status(400).send(JSON.stringify(error));
    }
  });

  app.post('/registerUser', async (req : any, res : any) => {
    //data from request body
    const phone = required(req.body,'phone');
    const email = required(req.body, "email");
  const displayName = required(req.body, "name");
  const password = required(req.body, "password")

  const exists = await admin.firestore().collection("users").where("phone", "==", phone).get().then((snapshot: { docs: { data: () => any; }[]; }) => snapshot.docs[0]?.data());
  if (exists) {
    res.status(400).send("Account already exists");
  }

  const user = {
    email,
    phoneNumber: phone,
    displayName,
    created: admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin
      .auth()
      .createUser({
        email: email,
        emailVerified: false,
        password: password,
        displayName: displayName,
        disabled: false,
        phoneNumber: phone,
      }).catch((e: any) => {
        res.status(422).send(e.message);
      });
  admin.firestore().collection("users").doc(phone).set(user);
  // See the UserRecord reference doc for the contents of userRecord.
  res.status(200).send(user);
  });

  app.post('/getUser', async (req : any, res : any) => {
    //data from request body
    const email = required(req.body,'email');
    const user = await admin.firestore().collection("users").where("email", "==", email).get().then((snapshot: { docs: { data: () => any; }[]; }) => snapshot.docs[0]?.data());
    res.status(200).send(user);
  });

  app.post('/updateUser', async (req : any, res : any) => {
    //data from request body
    const phone = required(req.body,'phone');
    const email = required(req.body, "email");
  const displayName = required(req.body, "name");
  const bio = required(req.body, "bio"); 
  const user = {
    email,
    phoneNumber: phone,
    displayName,
    created: admin.firestore.FieldValue.serverTimestamp(),
    bio: bio,
  };
  admin.firestore().collection("users").doc(phone).set(user);
  // See the UserRecord reference doc for the contents of userRecord.
  res.status(200).send(user);
  });


  const required = (data: any, name: any) => {
    if(data.hasOwnProperty(name)) {
        return data[name];
    } else{
        console.log("API called with invalid parameter values");
        throw new functions.https.HttpsError('invalid-argument', `Parameter ${name} is required`);
    }
};

exports.user = functions.https.onRequest(app);

//method to add token to firestore collection
const addToken = async ({
    fcmToken,
    deviceId,
    phone,
    deviceModel,
    createdAt,
    appVersion,
}: { fcmToken: any, deviceId: any, phone: any, deviceModel: any, createdAt: any, appVersion: any }) => {
    const userData = {
        fcmToken,
        deviceId,
        phone, 
        deviceModel,
        createdAt,
        appVersion,
    };

    const allTokens = await admin.firestore().collection('FCM_tokens').where('phone', '==', phone).get();
    let tokenExists = false;
    let updatePhone = false;
    allTokens.forEach((tokenDoc: any) => {
        //log tokens to console
        functions.logger.info(`token: ${tokenDoc.data().fcmToken} phone: ${phone}`, { structuredData: true });
        if (tokenDoc.data().fcmToken === fcmToken) {
            tokenExists = true;
        }
        if(phone !== "" && tokenDoc.data().phone !== phone) {
            updatePhone = true;
        }
    });
    if (tokenExists) {
        return { success: true, message: "Token already exists" };
    }
    if(updatePhone) {
        admin.firestore().collection("FCM_tokens").doc().update({
            phone: phone,
        });
        return { success: true, message: "Updated phone number" };
    }
    else {
        admin.firestore().collection("FCM_tokens").doc().set(userData);
        console.log("New Token Added");
        return { success: true, ...userData };
    }
};

//method to delete token from firestore collection
const deleteToken = async ({ phone } : {phone: any}) => {
    admin.firestore().collection('FCM_tokens').where('phone', '==', phone).get()
        .then(function (querySnapshot: any) {
            // Once we get the results, begin a batch
            const batch = admin.firestore().batch();

            querySnapshot.forEach(function (doc: any) {
                // For each doc, add a delete operation to the batch
                batch.delete(doc.ref);
            });
            // Commit the batch
            return batch.commit();
        });
    console.log("Tokens deleted");
    return { success: true, message: "Deleted tokens successfully" }
};

const sendPushNotificationToDevice = async ({ phone, title, body } : {phone: any, title: any, body: any}) => {
    // Get the list of device tokens.
    const allTokens = await admin.firestore().collection('FCM_tokens').where('phone', '==', phone).get();
    const tokens: any[] = [];
    allTokens.forEach((tokenDoc : any) => {
        const docData = tokenDoc.data();
        //log tokens to console
        functions.logger.info(`token: ${tokenDoc.data().fcmToken}`, { structuredData: true });
        tokens.push(docData.fcmToken);
    });

    if (tokens.length > 0) {
        //defining payload
        const message = {
            data: {
                title: title,
                body: body,
            },
        };
        // Send notifications to all tokens.
        await admin.messaging().sendToDevice(tokens, message);
        functions.logger.info(`Notifications have been sent`, { structuredData: true });
    }
    return { success: true, message: 'successfully sent push notification' };
}