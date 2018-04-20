const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

// Constructor of cache function to make it toggleable and set variables
mongoose.Query.prototype.cache = function(options = {}) {
    this.useCache = true;
    this.hashKey = JSON.stringify(options.key || '');
    return this;
};

mongoose.Query.prototype.exec = async function() {
    // If use of cache is set to false, execute and return the query instead
    if(!this.useCache) {
        return exec.apply(this, arguments);
    }

    // Assign collection and query name as unique key
    const key = Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    });

    // Get any cache value for the key
    const cacheValue = await client.hget(this.hashKey, key);
    if(cacheValue) {
        const doc = JSON.parse(cacheValue);
        Array.isArray(doc)? doc.map(d => new this.model(d)): new this.model(doc);
    }

    // If no cache, get the data through MongoDB query
    const result = await exec.apply(this, arguments);
    client.hset([this.hashKey, key, JSON.stringify(result)], 'EX', 10);
    return result;
};

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
};