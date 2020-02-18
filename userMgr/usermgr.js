
// Configure Environment
const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);

const Response = require("../libs/response-lib");
const tmCommon = require('../tenantMgr/tenantMgrCommon');

// Declare shared modules
const tokenManager = require('../libs/token-manager.js');

const DynamoDBHelper = require('../libs/dynamodb-helper.js');
const cognitoUsers = require('../libs/cognito-user.js');
const sharedFunctions = require('./sharedfunctions');
const crypto = require('crypto');
const unique = require('../libs/uniquecodeGenerators.js');

class UserMgr {
    constructor(event) {
    }

    health(event) {
        console.log("User Manager Health Check");
        return new Promise((resolve, reject) => {
            resolve({service: 'User Manager', isAlive: true});
        });
    }

    /**
     * Get user attributes
     */
    get(event) {
        console.log('Getting user id: ' + event.pathParameters.id);
        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {
                // get the tenant id from the request
                if (credentials) {

                        var tenantId = tokenManager.getTenantId(event);

                    sharedFunctions.lookupUserPoolData(credentials, decodeURIComponent(event.pathParameters.id), tenantId, false, function (err, user) {
                        if (err) {
                            console.log("lookupPool: callback error ");
                            reject({"Error": "Error getting user"});
                        } else {
                            cognitoUsers.getCognitoUser(credentials, user, function (err, user) {
                                if (err) {
                                    console.log("getCognitoUser: callback error ");
                                    reject('Error lookup user user: ' + event.pathParameters.id);
                                }
                                else {
                                   resolve(user);
                                }
                            })
                        }
                    });
                } else {
                    console.log('Error retrieving credentials: err=' );
		            console.log(err);
                    reject(err);
                }
            });
        });

    }

    /**
     * Get a list of users using a tenant id to scope the list
     */
    getUsers(event) {
        console.log("User getUsers");
        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {

                if (credentials) {

                    var userPoolId = getUserPoolIdFromRequest(event);
                    cognitoUsers.getUsersFromPool(credentials, userPoolId, configuration.aws_region)
                        .then(function (userList) {
                            var users = { items: userList };
                            resolve(users);
                        })
                        .catch(function (error) {
                            console.log("getUsers: rejected: error = ");
                            console.log(error);
                            reject("Error retrieving user list: " + error.message);
                        });
                } else {
                    console.log('Error retrieving credentials: err=' );
		            console.log(err);
                    reject(err);
                }
            });
        });

    }

    /**
     * Create a new user
     */
    create_old(event) {
        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {
                var user = JSON.parse(event.body);
                if (typeof user === "string") {
                    user = JSON.parse(user); // stringified twice somewhere create object.
                }
                console.log('Creating user: user = ');
                console.log(user);
                if (credentials) {

                    // extract requesting user and role from the token
                    var authToken = tokenManager.getRequestAuthToken(event);
                    var decodedToken = tokenManager.decodeToken(authToken);
                    var requestingUser = decodedToken.email;
                    user.tier = decodedToken['custom:tier'];
                    user.tenant_id = decodedToken['custom:tenant_id'];

                    // get the user pool data using the requesting user
                    // all users added in the context of this user
                    sharedFunctions.lookupUserPoolData(credentials, requestingUser, user.tenant_id, false, function (err, userPoolData) {
                        // if the user pool found, proceed
                        if (!err) {
                            sharedFunctions.createNewUser(credentials, userPoolData.UserPoolId, userPoolData.IdentityPoolId, userPoolData.client_id, user.tenant_id, user)
                                .then(function (createdUser) {
                                    console.log('User ' + user.userName + ' created');
                                    resolve({status: 'success'});
                                })
                                .catch(function (err) {
                                    console.log('Error creating new user in DynamoDB: ' + err.message);
                                    reject({"message": err.message});
                                })
                        }
                        else {
                            reject({"Error": "User pool not found"});
                        }
                    });
                } else {
                    console.log('Error retrieving credentials: err=' );
		    console.log(err);
                    reject(err);
                }
            });
        });

    }


    /**
     * Enable a user that is currently disabled
     */
    enable(event) {
        console.log("User enable");
        return new Promise(function (resolve, reject) {
            updateUserEnabledStatus(event, true, function (err, result) {
                if (err)
                    reject('Error enabling user');
                else
                    resolve(result);
            });
        });
    }


    /**
     * Disable a user that is currently enabled
     */
    disable(event) {
        console.log("User disable");
        return new Promise(function (resolve, reject) {
            updateUserEnabledStatus(event, false, function (err, result) {
                if (err)
                    reject('Error disabling user');
                else
                    resolve(result);
            });
        });
    }


    /**
     * Update a user's attributes
     */
    update(event) {
        console.log("User update");
        return new Promise(function (resolve, reject) {
            var user = JSON.parse(event.body);
            if (typeof user === "string") {
                user = JSON.parse(user); // stringified twice somewhere create object.
            }
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {
                // get the user pool id from the request
                if (credentials) {

                    var userPoolId = getUserPoolIdFromRequest(event);

                    console.log("=======userPoolId-for-create-new-user======"+JSON.stringify(userPoolId));
                    console.log("=======user-for-create-new-user======"+JSON.stringify(user));
                    console.log("=======credentials-for-create-new-user======"+JSON.stringify(credentials));

                    
                    // update user data
                    cognitoUsers.updateUser(credentials, user, userPoolId, configuration.aws_region)
                        .then(function (updatedUser) {
                            resolve(updatedUser);
                        })
                        .catch(function (err) {
                            reject("Error updating user: " + err.message);
                        });
                } else {
                    console.log('Error retrieving credentials: err=' );
		    console.log(err);
                    reject(err);
                }
            });
        });
    }

    del(event) {
        return new Promise(function (resolve, reject) {
            var userName = decodeURIComponent(event.pathParameters.id);
            console.log('deleting user id: ' + event.pathParameters.id);
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {
                if (credentials) {

                    // get the tenant id from the request
                    var tenantId = tokenManager.getTenantId(event);

                    // see if the user exists in the system
                    sharedFunctions.lookupUserPoolData(credentials, userName, tenantId, false, function (err, userPoolData) {
                        var userPool = userPoolData;
                        // if the user pool found, proceed
                        if (err) {
                            reject("User does not exist");
                        }
                        else {
                            sharedFunctions.deleteUser(credentials,userPool.UserPoolId, tenantId, userName)
                                .then(function (result) {
                                    console.log('User ' + userName + ' deleted ');
                                    resolve({status: 'success'});
                                })
                                .catch(function (error) {
                                    console.log('Error deleting  user: ' + err.message);
                                    reject({"Error": "Error deleting user"});
                                });
                        }
                    });
                } else {
                    console.log('Error retrieving credentials: err=' );
		    console.log(err);
                    reject(err);
                }
            });
        });
    }
//Ramesh Start
    getUsersByTenantId(event){
        console.log("User getUsers");
        console.log("==========USER GET USER BY ID====="+JSON.stringify(event));
        
        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {

                if (credentials) {
                    console.log("==========USER GET USER BY ID====="+JSON.stringify(event));

                    var userPoolId = getUserPoolIdFromRequest(event);

                    var userSchema = {
                        TableName : configuration.table.user,
                        KeySchema: [
                            { AttributeName: "tenant_id_key", KeyType: "HASH"},
                            { AttributeName: "id", KeyType: "RANGE" }  
                        ],
                        AttributeDefinitions: [
                            { AttributeName: "tenant_id_key", AttributeType: "N" },
                            { AttributeName: "id", AttributeType: "S" }
                        ],
                        ProvisionedThroughput: {
                            ReadCapacityUnits: 10,
                            WriteCapacityUnits: 10
                        }
                    };

                    var dynamoHelper = new DynamoDBHelper(userSchema, credentials, configuration);

                    console.log("==========USER GET USER BY ID dynamoHelper====="+JSON.stringify(dynamoHelper));

                    console.log("==========USER GET USER BY ID= userSchema===="+JSON.stringify(event));

                    var searchParams = {       
                        TableName: userSchema.TableName,
                        FilterExpression: "tenant_id_key = :tenant_id_key",
                        ExpressionAttributeValues: {
                            ":tenant_id_key": event.pathParameters.id
                        }
                    }

                    console.log("==========USER GET USER BY ID searchParams====="+JSON.stringify(event));

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
                                reject(err);
                            } else {
                                console.log('return user = ');
                                console.log(users[0]);
                                resolve(users[0]);
                            }
                        }
                    });

                    // cognitoUsers.getUsersFromPool(credentials, userPoolId, configuration.aws_region)
                    //     .then(function (userList) {
                    //         var users = { items: userList };
                    //         resolve(users);
                    //     })
                    //     .catch(function (error) {
                    //         console.log("getUsers: rejected: error = ");
                    //         console.log(error);
                    //         reject("Error retrieving user list: " + error.message);
                    //     });
                } else {
                    console.log('Error retrieving credentials: err=' );
		            console.log(err);
                    reject(err);
                }
            });
        });
    }
//Ramesh End


//Ramesh Start
createUser(event){
    return new Promise(function (resolve, reject) {
        tokenManager.getCredentialsFromToken(event, function (err, credentials) {
            var user = JSON.parse(event.body);
            if (typeof user === "string") {
                user = JSON.parse(user); // stringified twice somewhere create object.
            }
            console.log('Creating user: createUser = ');
            console.log("==============createUser==========",JSON.stringify(user));
            if (credentials) {
                console.log("==========USER GET USER BY ID====="+JSON.stringify(event));

                var authToken = tokenManager.getRequestAuthToken(event);
                var decodedToken = tokenManager.decodeToken(authToken);
                var requestingUser = decodedToken["custom:tenant_id"];
                user.tier = decodedToken['custom:tier'];
                user.tenant_id = decodedToken['custom:tenant_id'];
                var tenantIdParam = {
                    id: requestingUser
                };
                console.log("========DATA=========="+JSON.stringify(decodedToken));

                    // if the user pool found, proceed

                    var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

                    dynamoHelper.getItem(tenantIdParam, credentials, function (err, tenant) {
                        if (err) {
                            console.log('Error getting tenant: ' + err.message);
                            reject('{"Error" : "Error getting tenant"}'+{"Error": "User pool not found"});
                        }
                        else {
                            console.log("====tenat====="+JSON.stringify(tenant));
                            tokenManager.getUserPool(tenant.email, function (error, userPoolLookup) {
                                if (error) {
                                    console.log('Error creating new user in DynamoDB: ' + error);
                                    reject({"message": error});
                                }else{
                                    console.log("====userPoolLookup===="+JSON.stringify(userPoolLookup));
                                    sharedFunctions.createNewUser(credentials, userPoolLookup.user_pool_id, userPoolLookup.identity_pool_id, userPoolLookup.client_id, user.tenant_id, user)
                                        .then(function (createdUser) {
                                            console.log('User ' + user.userName + ' created');
                                            resolve({status: 'success'});
                                        })
                                        .catch(function (err) {
                                            console.log('Error creating new user in DynamoDB: ' + err.message);
                                            reject({"message": err.message});
                                        }) 
                                    }
                                })
                            }
                        });
                    //console.log("======lookupUserPoolDatalookupUserPoolData======"+JSON.stringify(userPoolData));
                //});
            } else {
                console.log('Error retrieving credentials: err=' );
                console.log(err);
                reject(err);
            }
        });
    });
}
//Ramesh end

//Ramesh Start
updateUser(event){
    console.log("User update-------------");
    return new Promise(function (resolve, reject) {
        var user = JSON.parse(event.body);
        if (typeof user === "string") {
            user = JSON.parse(user); // stringified twice somewhere create object.
        }
        tokenManager.getCredentialsFromToken(event, function (err, credentials) {
            // get the user pool id from the request
            if (credentials) {
                var userPoolId = getUserPoolIdFromRequest(event);
                
                console.log("=======userPoolId-for-create-new-user======"+JSON.stringify(userPoolId));
                console.log("=======user-for-create-new-user======"+JSON.stringify(user));
                console.log("=======credentials-for-create-new-user======"+JSON.stringify(credentials));

                var userSchema = {
                    TableName : configuration.table.user,
                    KeySchema: [
                        { AttributeName: "tenant_id_key", KeyType: "HASH"},
                        { AttributeName: "id", KeyType: "RANGE" }  
                    ],
                    AttributeDefinitions: [
                        { AttributeName: "tenant_id_key", AttributeType: "N" },
                        { AttributeName: "id", AttributeType: "S" }
                    ],
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 10,
                        WriteCapacityUnits: 10
                    }
                };
                var dynamoHelper = new DynamoDBHelper(userSchema, credentials, configuration);

                var searchParams = {       
                    TableName: userSchema.TableName,
                    FilterExpression: "id_key = :id_key",
                    ExpressionAttributeValues: {
                        ":id_key" : user.id_key
                    }
                }

                let code = unique.id();
                console.log("==========code====="+JSON.stringify(code));

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
                            reject(err);
                        } else {
                            console.log('return user = ');
                            console.log(users[0]);
                            
                            //sharedFunctions.updateItem(users[0], credentials, function (err, updateUser) {
                                console.log("users[0].id------"+JSON.stringify(users[0].id))
                                var keyParams = {
                                    //id: tenant.id
                                    tenant_id_key: users[0].tenant_id_key,
                                }
                            

                                var userUpdateParams = {
                                    TableName:                 configuration.table.user,
                                    Key:                       keyParams,
                                    UpdateExpression:          "set " +
                                                                   "first_name=:first_name, " +
                                                                   "last_name=:last_name, " +
                                                                   "company_name=:company_name, " +
                                                                   "account_name=:account_name, " +
                                                                   "owner_name=:owner_name, " +
                                                                   "#status=:status",
                                                                   
                                    ExpressionAttributeNames:  {
                                        '#status': 'status'
                                    },
                                    ExpressionAttributeValues: {
                                        ":company_name": user.company_name,
                                        ":account_name": user.account_name,
                                        ":owner_name":   user.owner_name,
                                        ":first_name" : user.first_name,
                                        ":last_name" : user.last_name,
                                        ":status":      user.status
                                    },
                                    ReturnValues:              "UPDATED_NEW"
                                };
                                console.log("----dfsadfasdf-----"+JSON.stringify(userUpdateParams))
                                var userSchema = {
                                    TableName : configuration.table.user,
                                    KeySchema: [
                                        { AttributeName: "tenant_id_key", KeyType: "HASH"},
                                        { AttributeName: "id", KeyType: "RANGE" }  
                                    ],
                                    AttributeDefinitions: [
                                        { AttributeName: "tenant_id_key", AttributeType: "N" },
                                        { AttributeName: "id", AttributeType: "S" }
                                    ],
                                    ProvisionedThroughput: {
                                        ReadCapacityUnits: 10,
                                        WriteCapacityUnits: 10
                                    }
                                };
                                // construct the helper object
                                var dynamoHelper1 = new DynamoDBHelper(userSchema, credentials, configuration);

                                dynamoHelper1.getDynamoDBDocumentClient(credentials, function (error, docClient) {

                                    //console.log("======itemParams-----======"+JSON.stringify(userUpdateParams));
                                     console.log("======docClient-----======"+JSON.stringify(docClient));
                                    docClient.update(userUpdateParams, function(err, data) {
                            
                                        console.log("======data-from-docClient----======"+JSON.stringify(data));
                            
                                        if (err){
                                        console.log("======docClient-err----======"+JSON.stringify(err));
                            
                                            reject(err);
                                        }
                                        else {
                                            resolve(data);
                                        }
                                    })
                                })
                                // dynamoHelper1.putItem(userUpdateParams, credentials, function (err, createdUser) {
                                //     if (err) {
                                //         console.log('updateUser: reject db got err = ');
                                //         console.log(err)
                                //         reject(err);
                                //     }
                                //     else {
                                //         resolve(createdUser)
                                //     }
                                // });
                                // this.getDynamoDBDocumentClient(credentials, function (error, docClient) {

                                //     docClient.put(userUpdateParams, function(err, data) {
                            
                                //         console.log("======data-from-docClient----======"+JSON.stringify(data));
                            
                                //         if (err){
                                //         console.log("======docClient-err----======"+JSON.stringify(err));
                            
                                //             reject(err);
                                //         }
                                //         else {
                                //             resolve(null, data);
                                //         }
                                //     })
                        //})
                    }
                }
                });

               

                // update user data
                // cognitoUsers.updateUser(credentials, user, userPoolId, configuration.aws_region)
                //     .then(function (updatedUser) {
                //         resolve(updatedUser);
                //     })
                //     .catch(function (err) {
                //         reject("Error updating user: " + err.message);
                //     });
            } else {
                console.log('Error retrieving credentials: err=' );
        console.log(err);
                reject(err);
            }
        });
    });  
}
//Ramesh End
}

/**
 * Enable/disable a user
 * @param event The request with the user information
 * @param enable True if enabling, False if disabling
 * @param callback Return results of applying enable/disable
 */
function updateUserEnabledStatus(event, enable, callback) {
    var user = JSON.parse(event.body);
    if (typeof user === "string") {
        user = JSON.parse(user); // stringified twice somewhere create object.
    }

    tokenManager.getCredentialsFromToken(event, function (err, credentials) {
        // get the tenant id from the request
        if (credentials) {

                var tenantId = tokenManager.getTenantId(event);
            // Get additional user data required for enabled/disable
            sharedFunctions.lookupUserPoolData(credentials, user.userName, tenantId, false, function (err, userPoolData) {
                var userPool = userPoolData;

                // if the user pool found, proceed
                if (err) {
                    callback(err);
                }
                else {
                    // update the user enabled status
                    cognitoUsers.updateUserEnabledStatus(credentials, userPool.UserPoolId, user.userName, enable)
                        .then(function () {
                            callback(null, {status: 'success'});
                        })
                        .catch(function (err) {
                            callback(err);
                        });
                }
            });
        } else {
                    console.log('Error retrieving credentials: err=' );
		    console.log(err);
                    reject(err);
        }
    });
}

/**
 * Extract a token from the header and return its embedded user pool id
 * @param event The request with the token
 * @returns The user pool id from the token
 */
function getUserPoolIdFromRequest(event) {
    var token = event.headers['Authorization'];
    var userPoolId;
    var decodedToken = tokenManager.decodeToken(token);
    if (decodedToken) {
        var pool = decodedToken.iss;
        userPoolId = pool.substring(pool.lastIndexOf("/") + 1);
    }
    return userPoolId;
};

module.exports = UserMgr;
