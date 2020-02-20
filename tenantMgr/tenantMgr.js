console.log("before configModule - process.env.stage = " + process.env.stage);

// Configure Environment
const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);

const AWS = require('aws-sdk');

// Declare shared modules
const tokenManager = require('../libs/token-manager.js');
const DynamoDBHelper = require('../libs/dynamodb-helper.js');
const cognitoUsers = require('../libs/cognito-user.js');
const tmCommon = require('./tenantMgrCommon');
const RequestHelper = require('../libs/request-helper');
const serviceDiscovery = require('../serviceDiscovery/serviceDiscovery-helper');

// Configure AWS Region
AWS.config.update({region: configuration.aws_region});



class tenantMgr {
    constructor(event) {
    }

    health(event) {
        console.log("User Manager Health Check");
        return new Promise((resolve, reject) => {
            resolve({service: 'Tenant Manager', isAlive: true});
        });
    }

// Create REST entry points
    getTenant(event) {
        console.log('Fetching tenant: ' + event.pathParameters.id);

        // init params structure with request params
        var tenantIdParam = {
            id: event.pathParameters.id
        };
        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err,credentials) {
                if (credentials) {

                        // construct the helper object
                    var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

                    dynamoHelper.getItem(tenantIdParam, credentials, function (err, tenant) {
                        if (err) {
                            console.log('Error getting tenant: ' + err.message);
                            reject('{"Error" : "Error getting tenant"}');
                        }
                        else {
                            console.log('Tenant ' + event.pathParameters.id + ' retrieved');
                            resolve(tenant);
                        }
                    });

                } else {
                    console.log('Error retrieving credentials: err= ' );
                    console.log(err);
                    reject(err);
                }
            });
        });
    }


    getTenants(event) {
        console.log('Fetching all tenants');

        return new Promise(function (resolve, reject) {

        console.log("--event----"+JSON.stringify(event))            

            tokenManager.getCredentialsFromToken(event, function(err,credentials) {
                /*
                var scanParams = {
                    TableName: tmCommon.tenantSchema.TableName,
                    FilterExpression: "#status = :active",
                    ExpressionAttributeNames:  {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ":active": "Active"
                    }
                };
                */
                
               var scanParams = {       
                TableName: tmCommon.tenantSchema.TableName,
                FilterExpression: "#status_lable = :status_value",
                ExpressionAttributeNames: {
                    "#status_lable" : "status",
                },
                ExpressionAttributeValues: {
                    ":status_value": "Active"
                }
                };
                
               /*
               var scanParams = {
                TableName: tmCommon.tenantSchema.TableName,
                ProjectionExpression: "#id, #email",
                ExpressionAttributeNames: {
                    "#id": "id",
                    "#email": "email"
                                }
            };
*/
                console.log("----scan param--"+JSON.stringify(scanParams))

                if (credentials) {

                    // construct the helper object
                    var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

                    dynamoHelper.scan(scanParams, credentials, function (error, tenants) {
                        if (error) {
                            console.log('Error retrieving tenants: ' + error.message);
                            reject('{"Error" : "Error retrieving tenants"}');
                        }
                        else {
                            var items = {items: tenants};
                            console.log('Tenants successfully retrieved items =');
                            console.log(items);
                            resolve(items);
                        }

                    });

                } else {
                    console.log('Error retrieving credentials: err= ' );
                    console.log(err);
                    reject(err);
                }
            });
        });
    }



    getTenantsSystem(event) {

        console.log('Fetching all tenants required to clean up infrastructure');
//Note: Reference Architecture not leveraging Client Certificate to secure system only endpoints. Please integrate the following endpoint with a Client Certificate.
//At least check that this is the system tenant ?

        var credentials = {};
        return new Promise(function (resolve, reject) {

            tokenManager.getSystemCredentials(function (err, systemCredentials) {
                if (err) {
                    reject('{"Error" : "Error retrieving systemCredentials"}');
                    return;
                }
                credentials = systemCredentials;
                var scanParams = {
                    TableName: tmCommon.tenantSchema.TableName,
                    FilterExpression: "#status = :active",
                    ExpressionAttributeNames:  {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ":active": "Active"
                    }
                }

                // construct the helper object
                var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

                dynamoHelper.scan(scanParams, credentials, function (error, tenants) {
                    if (error) {
                        console.log('Error retrieving tenants: ' + error.message);
                        reject('{"Error" : "Error retrieving tenants"}');
                    }
                    else {
                        var items = {items: tenants};
                        console.log('Tenants successfully retrieved items =');
                        console.log(items);
                        resolve(items);                    }

                });
            });
        });
    }



   update(event) {

       var tenant = JSON.parse(event.body);
       if (typeof tenant === "string") {
           tenant = JSON.parse(tenant); // stringified twice somewhere create object.
       }

       console.log('Updating tenant: ' + tenant.id);
       return new Promise(function (resolve, reject) {

           tokenManager.getCredentialsFromToken(event, function (err,credentials) {
               // init the params from the request data
               var keyParams = {
                   id: tenant.id
               }
               if (credentials) {

                   var tenantUpdateParams = {
                       TableName:                 tmCommon.tenantSchema.TableName,
                       Key:                       keyParams,
                       UpdateExpression:          "set " +
                                                      "company_name=:company_name, " +
                                                      "account_name=:account_name, " +
                                                      "owner_name=:owner_name, " +
                                                      "tier=:tier, " +
                                                      "#status=:status",
                       ExpressionAttributeNames:  {
                           '#status': 'status'
                       },
                       ExpressionAttributeValues: {
                           ":company_name": tenant.company_name,
                           ":account_name": tenant.account_name,
                           ":owner_name":   tenant.owner_name,
                           ":tier":        tenant.tier,
                           ":status":      tenant.status
                       },
                       ReturnValues:              "UPDATED_NEW"
                   };

                   // construct the helper object
                   var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

                   dynamoHelper.updateItem(tenantUpdateParams, credentials, function (err, tenantSaved) {
                       if (err) {
                           console.log('Error updating tenant: ' + err.message);
                           reject("Error updating tenant");
                       }
                       else {

                        var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);
                        var tenantIdParam = {
                            id: tenant.id
                        }
                        dynamoHelper.getItem(tenantIdParam, credentials, function (err, tenantItem) {
                            if (err) {
                                console.log('Error getting tenant: ' + err.message);
                                reject('{"Error" : "Error getting tenant"}');
                            }
                            else {
                                console.log("========UPDATEW ITEM======"+JSON.stringify(tenantItem));
                                
                                var userSchema = {
                                    TableName : configuration.table.user,
                                    KeySchema: [
                                        { AttributeName: "id", KeyType: "HASH"},
                                        { AttributeName: "tenant_id_key", KeyType: "RANGE" }  
                                    ],
                                    AttributeDefinitions: [
                                        { AttributeName: "id", AttributeType: "S" },
                                        { AttributeName: "tenant_id_key", AttributeType: "N" }
                                    ],
                                    ProvisionedThroughput: {
                                        ReadCapacityUnits: 10,
                                        WriteCapacityUnits: 10
                                    }
                                };

                                var dynamoHelper1 = new DynamoDBHelper(userSchema, credentials, configuration);
                                var searchParams = {       
                                    TableName: userSchema.TableName,
                                    FilterExpression: "email = :email",
                                    ExpressionAttributeValues: {
                                        ":email" : tenantItem.email
                                    }
                                }
                                dynamoHelper1.scan(searchParams, credentials, function (err, users) {
                                    if (err) {
                                        console.log('Error getting user: ' + err.message);
                                        callback(err);
                                    }
                                    else {
                                        if (users.length === 0) {
                                            var err = new Error('No user found: ' );
                                            console.log(err.message);
                                            console.log('--');
                                            reject(err);
                                        } else {
                                            var keyParams = {
                                                id: users[0].id,
                                                tenant_id_key: users[0].tenant_id_key
                                            }
            
                                            var userUpdateParams = {
                                                TableName:                 configuration.table.user,
                                                Key:                       keyParams,
                                                UpdateExpression:          "set " +
                                                                               "company_name=:company_name, " +
                                                                               "account_name=:account_name, " +
                                                                               "owner_name=:owner_name, " +
                                                                               "#status=:status",
                                                                               
                                                ExpressionAttributeNames:  {
                                                    '#status': 'status'
                                                },
                                                ExpressionAttributeValues: {
                                                    ":company_name": tenant.company_name,
                                                    ":account_name": tenant.account_name,
                                                    ":owner_name":   tenant.owner_name,
                                                    ":status":      tenant.status
                                                },
                                                ReturnValues:              "UPDATED_NEW"
                                            };
                                            dynamoHelper1.getDynamoDBDocumentClient(credentials, function (error, docClient) {
                                                docClient.update(userUpdateParams, function(err, data) {                            
                                                    if (err){                            
                                                        reject(err);
                                                    }
                                                    else {
                                                        resolve(data);
                                                    }
                                                })
                                            })
                                        }
                                    }
                                })
                               
                                
                               
                               
                              // console.log("==========="+JSON.stringify(dynamoHelper1));
                               
                                
                            }
                        });
                        //    console.log('Tenant ' + tenant.title + ' updated');
                        //    console.log("========Updated tenant====="+JSON.stringify(tenantSaved));
                           
                        //    resolve(tenantSaved);
                       }
                   });

               } else {
                   console.log('Error retrieving credentials: err= ' );
                   console.log(err);
                   reject(err);
               }
           });
       });
   }

    del(event) {

        console.log('Deleting Tenant: ' + event.pathParameters.id);
        return new Promise(function (resolve, reject) {

            tokenManager.getCredentialsFromToken(event,  function (err,credentials) {

                if (err || credentials === null || credentials === undefined) {
                    // lets get error out of the way and reject now
                    errorMsg = 'Error retrieving credentials: ' + err.message;
                    console.log(errorMsg);
                    reject(errorMsg);
                }
                console.log("====================11111============");
                
                //ok we have have credentials - lets move on.
                // init parameter structure
                var tenantId = event.pathParameters.id;

                var deleteTenantParams = {
                    TableName: tmCommon.tenantSchema.TableName,
                    Key:       {
                        id: tenantId
                    }
                };
                var errorMsg = "";
                /*   steps ....
                        0. get tenant data
                        1. set tenant.status to deleting and deletedate = today
                        2. get list of tenant users
                        3. delete users
                        4. delete roles & policies
                        5. mark tentant.status = deleted?  or deleteItem?
                 */
                // Step 0.  Get Tenant data...
                var tenant = {};
                console.log("deleting tenant: step 0 - get get tenant details..");
                findTenantInfo(tenantId, credentials)
                    .then((data) => {
                        tenant = data;
                        console.log("deleting tenant: step 1 - set deleting status...");
                        // Step 1. set tenant.status to deleting and deletedate = today
                        return markTenantStatus(tenant, credentials, "Deleting")
                    })
                    .then(() => {
                        // Step 2. get list of tenant users
                        console.log("deleting tenant: step 2 - get list of users ..");
                        //return getTenantUsers(tenant, credentials, tenant.UserPoolId);
                        return getTenantUsers(tenant, credentials, tenant.user_pool_id); //Ramesh

                     })
                    .then( (users) => {
                        var items = users.items;
                        console.log("deleting tenant: step 3 - delete all users for tenant..");
                        return removeTenantUsers(items, tenant);
                    })
                    .then( async (user) => {
                        console.log("deleting tenant: step 4 - delete polices.");
                        // step 4. delete roles & policies

                        var params = {
                            "pool": {
                                "UserPool": {
                                   // "Id": tenant.UserPoolId
                                   "Id" : tenant.user_pool_id
                                }
                             },
                            "userPoolClient": user.client_id,
                            "identityPool": {
                                //"IdentityPoolId": tenant.IdentityPoolId
                                "IdentityPoolId": tenant.identity_pool_id
                            },
                            "role": {
                                /*
                                "systemAdminRole": tenant.systemAdminRole,
                                "systemSupportRole": tenant.systemSupportRole,
                                "trustRole": tenant.trustRole,
                                */
                               "systemAdminRole": tenant.system_admin_role,
                               "systemSupportRole": tenant.system_support_role,
                               "trustRole": tenant.trust_role,
                            },
                            "policy": {
                                /**
                                "systemAdminPolicy": tenant.systemAdminPolicy,
                                "systemSupportPolicy": tenant.systemSupportPolicy,
                                 */
                                "systemAdminPolicy": tenant.system_admin_policy,
                                "systemSupportPolicy": tenant.system_support_policy,
                            },
                            "addRoleToIdentity": '',
                            "user": user
                        };

                        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'UserMgr','deleteTenantPolicies',process.env.stage);

                        var payLoad = {params: params};
                       return  RequestHelper.invokeLambda(functionName,payLoad)
                      })
                    .then((data) => {
                         console.log("deleting tenant: step 5 - mark tenant deleted.");
                        return  markTenantStatus(tenant, credentials, "Deleted")
                    })
                    .then(() => {
                        console.log('Tenant ' + tenantId + ' marked deleted');
                        resolve({status:true});
                    })
                    .catch((err) => {
                            errorMsg = 'Error delete user failure: ' + err.message;
                            console.log(errorMsg);
                            reject(errorMsg);
                    })
            });
        });
    }


}
function findTenantInfo(tenantId, credentials) {
    var tenantIdParam = {
        id: tenantId
    };
    return new Promise(function (resolve, reject) {
        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

        dynamoHelper.getItem(tenantIdParam, credentials, function (err, data) {
            console.log("findTenantInfo: check status of getItem..");
            if (err) {
                console.log('Error getting tenant: ' + err.message);
                reject('{"Error" : "Error getting tenant"}');
            } else {
                console.log('findTenantInfo: Tenant ' + tenantId + ' retrieved');
                resolve(data);
            }
        });
    });
}
function removeTenantUsers(items, tenant) {
    return new Promise(function (resolve, reject) {

        var adminUser = {};
        var status = 0;
        items.forEach(async (user) => {
            var payLoad = {
                /**
                userName:   tenant.userName,
                tenantId:   tenant.id,
                UserPoolId: tenant.UserPoolId
                 */
                userName : tenant.email,
                tenantId : tenant.id,
                userPoolId :  tenant.user_pool_id
            };

            if (user.role == "TenantAdmin") {
                adminUser = user;
            }

            var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'UserMgr','deleteUser',process.env.stage);

            // step 3. delete users
          await  RequestHelper.invokeLambda(functionName, payLoad)
                .then((data) => {
                    console.log("invokeLambda returned success ");
                })
                .catch((err) => {
                    console.log("invokeLambda returned ERROR err = ");
                    console.log(err);
                    status += 1;
                })
        })
        if (status < items.length) {
            resolve(adminUser);
        } else {
            reject("Error deleting users");
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

function getTenantUsers(tenant, credentials, userPoolId) {
    return new Promise(function (resolve, reject) {
        console.log("=========userPoolId========"+userPoolId);
        
        cognitoUsers.getUsersFromPool(credentials, userPoolId, configuration.aws_region)
            .then(function (userList) {
                var users = {items: userList};
                resolve(users);
            })
            .catch(function (error) {
                console.log("getTenantUsers: rejected: error = ");
                console.log(error);
                reject("Error retrieving user list: " + error.message);
            });
    });
}

function markTenantStatus(tenant, credentials, newstatus) {
    var keyParams = {
        id: tenant.id
    }

    var now = new Date();

    var tenantUpdateParams = {
        TableName:                 tmCommon.tenantSchema.TableName,
        Key:                       keyParams,
        UpdateExpression:          "set " +
                                       "#status=:status, " +
                                        "statusChanged=:todaysdate ",
        ExpressionAttributeNames:  {
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ":status":      newstatus,
            ":todaysdate":      now.toLocaleString(),
        },
        ReturnValues:              "UPDATED_NEW"
    };
    return new Promise(function (resolve, reject) {

        // construct the helper object
        var dynamoHelper = new DynamoDBHelper(tmCommon.tenantSchema, credentials, configuration);

        dynamoHelper.updateItem(tenantUpdateParams, credentials, function (err, tenantSaved) {
            if (err) {
                console.log('markTenantStatus: Error updating tenant: ' + err.message);
                reject("Error updating tenant: " + err.message);
            } else {
                resolve(tenantSaved);
            }
        });
    });

}
module.exports = tenantMgr;