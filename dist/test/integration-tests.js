"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var simple_mock_1 = require("simple-mock");
var server_1 = require("@cdm-logger/server");
var graphql_1 = require("graphql");
var iterall_1 = require("iterall");
var subscription_1 = require("graphql/subscription");
var graphql_subscriptions_1 = require("graphql-subscriptions");
var amqp_pubsub_1 = require("../amqp-pubsub");
var logger = server_1.ConsoleLogger.create('integration-test', { level: 'trace' });
chai.use(chaiAsPromised);
var expect = chai.expect;
var FIRST_EVENT = 'FIRST_EVENT';
function buildSchema(iterator) {
    return new graphql_1.GraphQLSchema({
        query: new graphql_1.GraphQLObjectType({
            name: 'Query',
            fields: {
                testString: {
                    type: graphql_1.GraphQLString,
                    resolve: function (_, args) {
                        return 'works';
                    },
                },
            },
        }),
        subscription: new graphql_1.GraphQLObjectType({
            name: 'Subscription',
            fields: {
                testSubscription: {
                    type: graphql_1.GraphQLString,
                    subscribe: graphql_subscriptions_1.withFilter(function () { return iterator; }, function () { return true; }),
                    resolve: function (root) {
                        return 'FIRST_EVENT';
                    },
                },
            },
        }),
    });
}
describe('PubSubAsyncIterator', function () {
    var query = graphql_1.parse("\n    subscription S1 {\n      testSubscription\n    }\n  ");
    var config = { host: '127.0.0.1', port: 5672 };
    var pubsub = new amqp_pubsub_1.AmqpPubSub({ config: config, logger: logger });
    var origIterator = pubsub.asyncIterator(FIRST_EVENT);
    var returnSpy = simple_mock_1.mock(origIterator, 'return');
    var schema = buildSchema(origIterator);
    var results = subscription_1.subscribe(schema, query);
    it('should allow subscriptions', function () {
        expect(iterall_1.isAsyncIterable(results)).to.be.true;
        var r = results.next();
        pubsub.publish(FIRST_EVENT, {});
        r.then(function (res) {
            expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
        });
    });
    it('should clear event handlers', function () {
        expect(iterall_1.isAsyncIterable(results)).to.be.true;
        pubsub.publish(FIRST_EVENT, {});
        results.return()
            .then(function (res) {
            expect(returnSpy.callCount).to.be.gte(1);
        });
    });
});
//# sourceMappingURL=integration-tests.js.map