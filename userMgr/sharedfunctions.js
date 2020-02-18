
const AWS = require('aws-sdk');
const uuidV4 = require("uuidv4");
const moment = require('moment');

const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);
const DynamoDBHelper = require('../libs/dynamodb-helper.js');
const cognitoUsers = require('../libs/cognito-user.js');
const uniqueCode = require('../libs/uniquecodeGenerators.js');

var userSchema = {
    TableName : configuration.table.user,
    KeySchema: [
        { AttributeName: "tenant_id_key", KeyType: "HASH"},
       // { AttributeName: "tenant_id", KeyType: "HASH"},  //Partition key
        { AttributeName: "id", KeyType: "RANGE" }  //Sort key
    ],
    AttributeDefinitions: [
        { AttributeName: "tenant_id_key", AttributeType: "N" },
        { AttributeName: "id", AttributeType: "S" }
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
    },
   /* GlobalSecondaryIndexes: [
        {
            //IndexName: 'UserNameIndex',
            IndexName: 'EmailIndex',
            KeySchema: [
                { AttributeName: "id", KeyType: "HASH"}
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            }
        }
    ] */
};

module.exports.userSchema = userSchema;

module.exports.getUUID = function(callback){
    var sss= uuidV4();
    console.log("eeeeeeeeeeeeeeeeeeeee"+sss)
    var idkey = {
        "id":"ddd",
        "key": "dddddd"
    }
    callback(idkey) ;
}


/**
 * Lookup a user's pool data in the user table
 * @param credentials The credentials used ben looking up the user
 * @param userId The id of the user being looked up
 * @param tenantId The id of the tenant (if this is not system context)
 * @param isSystemContext Is this being called in the context of a system user (registration, system user provisioning)
 * @param callback The results of the lookup
 */
module.exports.lookupUserPoolData = function (credentials, userId, tenantId, isSystemContext, callback) {
    console.log("--shared fun ---1---"+userId)
    console.log("shared fun credentials--66---"+JSON.stringify(credentials))
    console.log("shared fun --66---"+JSON.stringify(configuration))
    
    // construct the helper object
    var dynamoHelper = new DynamoDBHelper(userSchema, credentials, configuration);

    // if we're looking this up in a system context, query the GSI with user name only
    if (isSystemContext) {

        // init params structure with request params
        /*
        var searchParams = {
            TableName: userSchema.TableName,
            IndexName: userSchema.GlobalSecondaryIndexes[0].IndexName,
            KeyConditionExpression: "id = :id",
            ExpressionAttributeValues: {
                ":id": userId
            }
        };
        */
        var searchParams = {       
            TableName: userSchema.TableName,
            //IndexName: userSchema.GlobalSecondaryIndexes[0].IndexName,
            FilterExpression: "email = :email",
            //KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: {
                ":email": userId
            }
        }

        // get the item from the database
        console.log("--sharedjfun--- searchparam--"+JSON.stringify(searchParams))
        dynamoHelper.scan(searchParams, credentials, function (err, users) {
            if (err) {
                console.log('Error getting user: ' + err.message);
                callback(err);
            }
            else {
                console.log("--shared fun--users-"+JSON.stringify(users))
                console.log("-users.length-"+users.length)
                if (users.length === 0) {
                    var err = new Error('No user found: ' + userId);
                    console.log(err.message);
                    console.log('--');
                    callback(err);
                } else {
                    console.log('return user = ');
                    console.log(users[0]);
                    callback(null, users[0]);
                }
            }
        });
    }
    else {
        // if this is a tenant context, then we must get with tenant id scope
        var getParams = {
            id: userId,
            tenant_id: tenantId
        }

        // get the item from the database
        dynamoHelper.getItem(getParams, credentials, function (err, user) {
            if (err) {
                console.log('Error getting user: ' + err.message);
                callback(err);
            }
            else {
                callback(null, user);
            }
        });
    }
}


/**
 * Create a new user using the supplied credentials/user
 * @param credentials The creds used for the user creation
 * @param userPoolId The user pool where the user will be added
 * @param identityPoolId the identityPoolId
 * @param clientId The client identifier
 * @param tenantId The tenant identifier
 * @param newUser The data fro the user being created
 * @param callback Callback with results for created user
 */

module.exports.createNewUser = function (credentials, userPoolId, identityPoolId, clientId, tenantId, newUser) {
    
    var promise = new Promise(function(resolve, reject) {
        // fill in system attributes for user (not passed in POST)
       // newUser.userPoolId = userPoolId;
        newUser.user_pool_id = userPoolId;
        newUser.tenant_id = tenantId;
        newUser.email = newUser.email;
        // create the user in Cognito
        console.log("--sharedfuncin 126---"+JSON.stringify(newUser))
        console.log("---credentials----"+JSON.stringify(credentials))

        cognitoUsers.createUser(credentials, newUser, function (err, cognitoUser) {
            if (err) {
                console.log('createNewUser: reject got err == ');
                console.log(err)
                reject(err);
            } else {
                // populate the user to store in DynamoDB
                /*newUser.id = newUser.userName;
                newUser.UserPoolId = userPoolId;
                newUser.IdentityPoolId = identityPoolId;
                
                */
                newUser.id = uniqueCode.id("USER");
                newUser.id_key= uniqueCode.id_key();
                newUser.client_id = clientId;
                newUser.tenant_id = tenantId;
                /*newUser.sub = cognitoUser.User.Attributes[0].Value; */
                newUser.sub = newUser.email;
                newUser.first_name = newUser.first_name;
                newUser.last_name = newUser.last_name;
                newUser.identity_pool_id = identityPoolId;
                newUser.user_pool_id = userPoolId;                
                newUser.sub = newUser.email;
                newUser.user_name = newUser.email;
                newUser.status = "Active";
                newUser.user_alias = "-";            
                newUser.user_photo_location = "-";
                newUser.created_by_user = "-";
                newUser.last_modified_by_user = "-";
                newUser.company_name = newUser.company_name;
                newUser.account_name = newUser.account_name;
                newUser.tenant_id_key = newUser.tenant_id_key.toString();

                //var currentDateTime = new Date();
                var currentDateTime = moment().format('MM/DD/YYYY h:mm:ss a'); 
                //    console.log("d.toLocaleDateString('en-US')",d.toLocaleDateString('en-US'))
                //console.log("---d---"+d)



                newUser.user_last_login_datetime = currentDateTime.toString();
                newUser.status_change_datetime = currentDateTime.toString();
                newUser.created_datetime = currentDateTime.toString();
                newUser.last_modified_datetime = currentDateTime.toString();
                newUser.marked_for_deletion_datetime = currentDateTime.toString();
                newUser.marked_for_deletion_by_user = currentDateTime.toString();

                
                console.log("---check before insert--"+JSON.stringify(newUser))
                // construct the helper object
                var dynamoHelper = new DynamoDBHelper(userSchema, credentials, configuration);

                dynamoHelper.putItem(newUser, credentials, function (err, createdUser) {
                    if (err) {
                        console.log('createNewUser: reject db got err = ');
                        console.log(err)
                        reject(err);
                    }
                    else {
                        resolve(createdUser)
                    }
                });
            }
        });
    });

    return promise;
}

module.exports.deleteUser = function (credentials, UserPoolId, tenantId, userName) {

    return new Promise(function(resolve, reject) {

        // first delete the user from Cognito
        cognitoUsers.deleteUser(credentials, userName, UserPoolId, configuration.aws_region)
            .then(function (result) {
                console.log('User ' + userName + ' deleted from Cognito');

                // now delete the user from the user data base
                var deleteUserParams = {
                    TableName: userSchema.TableName,
                    Key:       {
                        id:        userName,
                        tenant_id: tenantId
                    }
                };

                // construct the helper object
                var dynamoHelper = new DynamoDBHelper(userSchema, credentials, configuration);

                // delete the user from DynamoDB
                dynamoHelper.deleteItem(deleteUserParams, credentials, function (err, user) {
                    if (err) {
                        console.log('Error deleting DynamoDB user: ' + err.message);
                        reject({"Error": "Error deleting DynamoDB user"});
                    }
                    else {
                        console.log('User ' + userName + ' deleted from DynamoDB');
                        resolve({status: 'success'});
                    }
                })
            })
            .catch(function (err) {
                console.log('Error deleting Cognito user: ' + err.message);
                reject({"Error": "Error deleting user"});
            });

    });

}