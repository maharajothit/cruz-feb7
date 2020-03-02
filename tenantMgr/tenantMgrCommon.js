
const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);

// Create a schema
/*
module.exports.tenantSchema = {
    TableName : configuration.table.tenant,
    KeySchema: [
        { AttributeName: "id", KeyType: "HASH"}  //Partition key
    ],
    AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" }
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
    }
};
*/
module.exports.tenantSchema = {
    TableName : configuration.table.tenant,
    KeySchema: [
        { AttributeName: "id", KeyType: "HASH"}  //Partition key
    ],
    AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" }
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
    },
    GlobalSecondaryIndexes: [
        {
            IndexName: 'TenantSDOIndex',
            KeySchema: [
                { AttributeName: "tenant_sdo_id", KeyType: "HASH"},
                { AttributeName: "id", KeyType: "RANGE"}            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            }
        },
        {
            IndexName: 'TenantAliasIndex',
            KeySchema: [
                { AttributeName: "tenant_alias", KeyType: "HASH"},
                { AttributeName: "id", KeyType: "RANGE"}            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            }
        },
        {
            IndexName: 'TenantNameIndex',
            KeySchema: [
                { AttributeName: "tenant_name", KeyType: "HASH"},
                { AttributeName: "id", KeyType: "RANGE"}            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            }
        },
        {
            IndexName: 'TenantIdKeyIndex',
            KeySchema: [
                { AttributeName: "id_key", KeyType: "HASH"},
                { AttributeName: "id", KeyType: "RANGE"}            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            }
        }
    ]
};

