const request = require('request');
const moment  = require('moment');
console.log("before configModule - process.env.stage = " + process.env.stage);

const uuidV4 = require("uuidv4");

// Configure Environment
const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);

const Response = require("../libs/response-lib");

// Declare shared modules
const tokenManager = require('../libs/token-manager.js');
const DynamoDBHelper = require('../libs/dynamodb-helper.js');
const uniqueCode = require('../libs/uniquecodeGenerators.js');


// Create a schema
var entitySchema = {
    TableName : configuration.table.entity,
    KeySchema: [
        { AttributeName: "id", KeyType: "HASH"},  //Partition key
        { AttributeName: "id_key", KeyType: "HASH"},  //Partition key
        { AttributeName: "tenant_id_key", KeyType: "RANGE" }  //Sort key
    ],
    AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "id_key", AttributeType: "N" },        
        { AttributeName: "tenant_id_key", AttributeType: "N" }
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
    }
};

class entityMgr {
    constructor(event) {
        this.res = new Response();
        this.bearerToken = event.headers['Authorization'];
        if (this.bearerToken) {
            this.tenantId = tokenManager.getTenantId(event);
        }
    }

    health(event) {
        console.log("User Manager Health Check");
        return new Promise((resolve, reject) => {
            resolve({service: 'User Manager', isAlive: true});
        });
    }

    getEntity(event) {
        return new Promise(function (resolve, reject) {

            console.log('Fetching entity: ' + event.pathParameters.id);

            tokenManager.getCredentialsFromToken(event, function (err,credentials) {
                // init params structure with request params
                var tenantId = tokenManager.getTenantId(event);
                var productId = decodeURIComponent(event.pathParameters.id);
                var params = {
                    tenantId:  tenantId,
                    entityId: entityId
                }
                if (credentials) {

                    // construct the helper object
                    var dynamoHelper = new DynamoDBHelper(entitySchema, credentials, configuration);

                    dynamoHelper.getItem(params, credentials, function (err, entity) {
                        if (err) {
                            console.log('Error getting entity: ' + err.message);
                            reject("Error getting entity");
                        }
                        else {
                            console.log('entity ' + entityId + ' retrieved');
                            resolve(entity);
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

    getEntities(event) {

        return new Promise(function (resolve, reject) {
            console.log('Fetching Entities '+ event.pathParameters.id);
            tokenManager.getCredentialsFromToken(event, function (err,credentials) {
                var tenantId = tokenManager.getTenantId(event);

                console.log('Fetching Entity for Tenant Id: ' );
                console.log(tenantId);

                var searchParams = {       
                    TableName: entitySchema.TableName,
                    FilterExpression: "tenant_id_key = :tenant_id_key",
                    ExpressionAttributeValues: {
                        ":tenant_id_key": JSON.parse(event.pathParameters.id)
                    }
                }
                console.log("path param---"+JSON.stringify(event.pathParameters.id))
                console.log("==========USER GET USER BY ID searchParams====="+JSON.stringify(event));


                if (credentials) {
                    console.log("searchParams----"+JSON.stringify(searchParams))
                         // construct the helper object
                    var dynamoHelper = new DynamoDBHelper(entitySchema, credentials, configuration);

                    dynamoHelper.scan(searchParams, credentials, function (err, users) {
                        if (err) {
                            console.log('Error getting enity: ' + err.message);
                            callback(err);
                        }
                        else {
                            console.log("--shared fun--enity-"+JSON.stringify(users))
                            console.log("-enity.length-"+users.length)
                            if (users.length === 0) {
                                var err = new Error('No enity found: ');
                                console.log(err.message);
                                console.log('--');
                                reject(err);
                            } else {
                                console.log('return enity = ');
                                console.log(JSON.stringify(users));
                                let array = [];
                                for(let i = 0; users.length > i; i++){
                                    array.push(users[i]);
                                }
                                console.log("==========="+JSON.stringify(array));
                                

                                // var listUser = [];
                                // for (key in users) {    
                                //     listUser.push(Object.assign(users[key], {name: key}));
                                // }
                                // console.log("============"+JSON.stringify(listUser));
                                
                                resolve(array);
                                resolve(users[0]);
                            }
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

    create(event) {

        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err,credentials) {
                var entityReq = JSON.parse(event.body);
                if (typeof entityReq === "string") {
                    entityReq = JSON.parse(entityReq); // stringified twice somewhere create object.
                }
                var tenantId = tokenManager.getTenantId(event);
                entityReq.id = uniqueCode.id("ENTITY");
                entityReq.tenant_id_key =  entityReq.tenant_id_key;
                entityReq.created_by_user =  entityReq.created_by_user;

                var currentDateTime = moment().format('MM/DD/YYYY h:mm:ss a'); 

                entityReq.created_datetime = currentDateTime.toString();
                entityReq.last_modified_datetime = currentDateTime.toString();
                entityReq.marked_for_deletion_datetime =  currentDateTime.toString();
                entityReq.status_change_datetime = currentDateTime.toString();

                entityReq.entity_alias = entityReq.entity_alias;
                entityReq.entity_logo_url = entityReq.entity_logo_url ;
                entityReq.entity_name = entityReq.entity_name;
                entityReq.entity_photo_url = entityReq.entity_photo_url ;
                entityReq.entity_type = entityReq.entity_type;
                entityReq.last_modified_by_user = entityReq.last_modified_by_user ;
                entityReq.marked_for_deletion_by_user = entityReq.marked_for_deletion_by_user ;
                entityReq.status = "Active";

                // entityReq.tenantId = tenantId;
                if (credentials) {

                    console.log("create: product  ");
                    console.log(entityReq);
                    // construct the helper object
                    var dynamoHelper = new DynamoDBHelper(entitySchema, credentials, configuration);

                    dynamoHelper.putItem(entityReq, credentials, function (err, entity) {
                        if (err) {
                            console.log('Error creating new entity: ' + err.message);
                            reject("Error creating entity");
                        }
                        else {
                            console.log('Entity ' + entityReq.title + ' created');
                            resolve({status: 'success'});
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

    update(event){
        console.log("User update-------------");
        return new Promise(function (resolve, reject) {
            var entity  = JSON.parse(event.body);
            if (typeof user === "string") {
                entity  = JSON.parse(entity ); // stringified twice somewhere create object.
            }
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {
                // get the user pool id from the request
                if (credentials) {
                   
                    console.log("=======user-for-create-new-user======"+JSON.stringify(entity ));
                    console.log("=======credentials-for-create-new-user======"+JSON.stringify(credentials));
    
                    var entitySchema = {
                        TableName : configuration.table.entity,
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
                    var dynamoHelper = new DynamoDBHelper(entitySchema, credentials, configuration);
    
                    var searchParams = {       
                        TableName: entitySchema.TableName,
                        FilterExpression: "id = :id",
                        ExpressionAttributeValues: {
                            ":id" : event.pathParameters.id
                        }
                    }
    
                    dynamoHelper.scan(searchParams, credentials, function (err, users) {
                        if (err) {
                            console.log('Error getting entity: ' + err.message);
                            callback(err);
                        }
                        else {
                            console.log("--shared fun--entity-"+JSON.stringify(users))
                            console.log("-users.length-"+users.length)
                            if (users.length === 0) {
                                var err = new Error('No entity found: ' + userId);
                                console.log(err.message);
                                console.log('--');
                                reject(err);
                            } else {
                                console.log('return entity = ');
                                console.log(users[0]);
                                    console.log("users[0].id------"+JSON.stringify(users[0]))
                                    var keyParams = {
                                        //id: tenant.id
                                        id: users[0].id,
                                        tenant_id_key: users[0].tenant_id_key,
                                    }
                                    var entityUpdateParams = {
                                        TableName:                 configuration.table.entity,
                                        Key:                       keyParams,
                                        UpdateExpression:          "set " +
                                                                       "entity_name=:entity_name, " +
                                                                       "entity_alias=:entity_alias, " +
                                                                       "entity_type=:entity_type, " +
                                                                       "entity_photo_url=:entity_photo_url, " +
                                                                       "entity_logo_url=:entity_logo_url, " +
                                                                       "#status=:status",
                                                                       
                                        ExpressionAttributeNames:  {
                                            '#status': 'status'
                                        },
                                        ExpressionAttributeValues: {
                                            ":entity_name": entity.entity_name,
                                            ":entity_alias": entity.entity_alias,
                                            ":entity_type":   entity.entity_type,
                                            ":entity_photo_url" : entity.entity_photo_url,
                                            ":entity_logo_url" : entity.entity_logo_url,
                                            ":status":      entity.status
                                        },
                                        ReturnValues:              "UPDATED_NEW"
                                    };
                                    console.log("----dfsadfasdf-----"+JSON.stringify(entityUpdateParams))
                                    var entitySchema = {
                                        TableName : configuration.table.entity,
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
                                    // construct the helper object
                                    var dynamoHelper1 = new DynamoDBHelper(entitySchema, credentials, configuration);
    
                                    dynamoHelper1.getDynamoDBDocumentClient(credentials, function (error, docClient) {
    
                                        //console.log("======itemParams-----======"+JSON.stringify(userUpdateParams));
                                         console.log("======docClient-----======"+JSON.stringify(docClient));
                                        docClient.update(entityUpdateParams, function(err, data) {
                                
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
                        }
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

    del(event){
        return new Promise(function (resolve, reject) {
            tokenManager.getCredentialsFromToken(event, function (err, credentials) {
                // get the user pool id from the request
                if (credentials) {
                    var entitySchema = {
                        TableName : configuration.table.entity,
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
                    var dynamoHelper = new DynamoDBHelper(entitySchema, credentials, configuration);
    
                    var searchParams = {       
                        TableName: entitySchema.TableName,
                        FilterExpression: "id = :id",
                        ExpressionAttributeValues: {
                            ":id" : event.pathParameters.id
                        }
                    }
    
                    dynamoHelper.scan(searchParams, credentials, function (err, users) {
                        if (err) {
                            console.log('Error getting entity: ' + err.message);
                            callback(err);
                        }
                        else {
                            if (users.length === 0) {
                                var err = new Error('No entity found: ' );
                                console.log(err.message);
                                console.log('--');
                                reject(err);
                            } else {
                                console.log('return entity = ');
                                console.log(users[0].id);
                                    var keyParams = {
                                        id: users[0].id,
                                        tenant_id_key: users[0].tenant_id_key
                                    }
                                    var entityUpdateParams = {
                                        TableName:                 configuration.table.entity,
                                        Key:                       keyParams,
                                        UpdateExpression:          "set " +
                                                                       "#status=:status",
                                                                       
                                        ExpressionAttributeNames:  {
                                            '#status': 'status'
                                        },
                                        ExpressionAttributeValues: {
                                            ":status":      'Delete'
                                        },
                                        ReturnValues:              "UPDATED_NEW"
                                    };
                                    var entitySchema = {
                                        TableName : configuration.table.entity,
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
                                    // construct the helper object
                                    var dynamoHelper1 = new DynamoDBHelper(entitySchema, credentials, configuration);
                                    dynamoHelper1.getDynamoDBDocumentClient(credentials, function (error, docClient) {
                                            docClient.update(entityUpdateParams, function(err, data) {
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
                    });  
                } else {
                    console.log('Error retrieving credentials: err=' );
                    console.log(err);
                    reject(err);
                }
            });
        });  
    }
}

module.exports = entityMgr;