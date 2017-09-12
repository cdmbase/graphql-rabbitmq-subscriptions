import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { ConsoleLogger } from '@cdm-logger/server';
import {
  IRabbitMqConnectionConfig,
  RabbitMqConnectionFactory,
} from 'rabbitmq-pub-sub';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';

import { SubscriptionManager } from 'graphql-subscriptions';
import { AmqpPubSub } from '../amqp-pubsub';

const logger = ConsoleLogger.create('integration-test', { level: 'trace'});

chai.use(chaiAsPromised);
const expect = chai.expect;
const assert = chai.assert;

// various subscription endpoints
const TRIGGER1 = 'Trigger1';
const TRIGGER2 = 'Trigger2';
const TEST_SUBSCRIPTION = 'testSubscription';
const NOT_A_TRIGGER = 'NotATrigger';
const FILTER1 = 'Filter1';

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      testString: {
        type: GraphQLString,
        resolve: function (_, args) {
          return 'works';
        },
      },
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      testSubscription: {
        type: GraphQLString,
        resolve: function (root) {
          return root;
        },
      },
      testFilter: {
        type: GraphQLString,
        resolve: function (root, { filterBoolean }) {
          return filterBoolean ? 'goodFilter' : 'badFilter';
        },
        args: {
          filterBoolean: { type: GraphQLBoolean },
        },
      },
      testFilterMulti: {
        type: GraphQLString,
        resolve: function (root, { filterBoolean }) {
          return filterBoolean ? 'goodFilter' : 'badFilter';
        },
        args: {
          filterBoolean: { type: GraphQLBoolean },
          a: { type: GraphQLString },
          b: { type: GraphQLInt },
        },
      },
      testChannelOptions: {
        type: GraphQLString,
        resolve: function (root) {
          return root;
        },
        args: {
          repoName: { type: GraphQLString },
        },
      },
    },
  }),
});

describe('SubscriptionManager', function () {
  this.timeout(30000);
  const subManager = new SubscriptionManager({
    schema,
    setupFunctions: {
      'testFilter': (options, { filterBoolean }) => {
        return {
          'Filter1': { filter: (root) => root.filterBoolean === filterBoolean },
        };
      },
      'testFilterMulti': (options) => {
        return {
          'Trigger1': { filter: () => true },
          'Trigger2': { filter: () => true },
        };
      },
    },
    pubsub: new AmqpPubSub({ logger }),
  });

  it('throws an error if query is not valid', function () {
    const query = 'query a{ testInt }';
    const callback = () => null;
    return expect(subManager.subscribe({ query, operationName: 'a', callback }))
      .to.eventually.be.rejectedWith('Subscription query has validation errors');
  });

  it('rejects subscriptions with more than one root field', function () {
    const query = 'subscription X{ a: testSubscription, b: testSubscription }';
    const callback = () => null;
    return expect(subManager.subscribe({ query, operationName: 'X', callback }))
      .to.eventually.be.rejectedWith('Subscription query has validation errors');
  });

  it('can subscribe with a valid query and get the root value', function (done) {
    const query = 'subscription X{ testSubscription }';
    let subscriberId;
    const callback = function (err, payload) {
      try {
        expect(payload.data.testSubscription).to.equals('good');
        setTimeout(() => done(), 2);
      } catch (e) {
        setTimeout(() => done(e), 2);
        return;
      } finally {
        subManager.unsubscribe(subscriberId);
      }
    };

    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subscriberId = subId;
      subManager.publish('testSubscription', 'good');
    });
  });

  it('can use filter functions properly', function (done) {
    const query = `subscription Filter1($filterBoolean: Boolean){
     testFilter(filterBoolean: $filterBoolean)
   }`;
    let subscriberId;
    const callback = function (err, payload) {
      try {
        expect(payload.data.testFilter).to.equals('goodFilter');
        setTimeout(() => done(), 2);
      } catch (e) {
        setTimeout(() => done(e), 2);
        return;
      } finally {
        subManager.unsubscribe(subscriberId);
      }
    };
    subManager.subscribe({
      query,
      operationName: 'Filter1',
      variables: { filterBoolean: true },
      callback,
    }).then(subId => {
      subscriberId = subId;
      subManager.publish(FILTER1, { filterBoolean: false });
      subManager.publish(FILTER1, { filterBoolean: true });
    });
  });

  it('can subscribe to more than one trigger', function (done) {

    let triggerCount = 0;
    const query = `subscription multiTrigger($filterBoolean: Boolean, $uga: String){
      testFilterMulti(filterBoolean: $filterBoolean, a: $uga, b: 66)
    }`;
    let subscriberId;
    const callback = function (err, payload) {
      try {
        expect(payload.data.testFilterMulti).to.equals('goodFilter');
        triggerCount++;
              logger.debug('Checking the callback ', err, payload, triggerCount);
      } catch (e) {
        setTimeout(() => done(e), 2);
        subManager.unsubscribe(subscriberId);
        return;
      }
      if (triggerCount === 2) {
       subManager.unsubscribe(subscriberId);
        setTimeout(() => done(), 2);
      }
    };
    subManager.subscribe({
      query,
      operationName: 'multiTrigger',
      variables: { filterBoolean: true, uga: 'UGA' },
      callback,
    }).then(subId => {
      subscriberId = subId;
      subManager.publish(NOT_A_TRIGGER, { filterBoolean: false });
      subManager.publish(TRIGGER1, { filterBoolean: true });
      subManager.publish(TRIGGER2, { filterBoolean: true });
    });
  });

  it('can unsubscribe', function (done) {
    const query = 'subscription X{ testSubscription }';
    const callback = (err, payload) => {
      logger.debug('callback would not be called but called with ', payload, err);
      try {
        assert(false);
      } catch (e) {
        done(e);
        return;
      }
      done();
    };
    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subManager.unsubscribe(subId);
      subManager.publish('testSubscription', 'bad');
      setTimeout(done, 100);
    });
  });

  it('throws an error when trying to unsubscribe from unknown id', function () {
    expect(() => subManager.unsubscribe(123))
      .to.throw('undefined');
  });

  it('calls the error callback if there is an execution error', function (done) {
    const query = `subscription X($uga: Boolean!){
      testSubscription @skip(if: $uga)
    }`;
    let subscriberId;
    const callback = function (err, payload) {
      try {
        expect(payload.errors[0].message).to.equals(
          'Variable "$uga" of required type "Boolean!" was not provided.',
        );
        setTimeout(() => done(), 2);
      } catch (e) {
        setTimeout(() => done(e), 2);
      } finally {
        subManager.unsubscribe(subscriberId);
      }
    };

    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subscriberId = subId;
      subManager.publish('testSubscription', 'good');
    });
  });

  it('can use transform function to convert the trigger name given into more explicit channel name', function (done) {
    const triggerTransform = (trigger, { path }) => [trigger, ...path].join('.');
    const pubsub = new AmqpPubSub({
      logger,
      triggerTransform,
    });
    let subscriberId;
    const subManager2 = new SubscriptionManager({
      schema,
      setupFunctions: {
        testChannelOptions: (options, {repoName}) => ({
          comments: {
            channelOptions: { path: [repoName] },
          },
        }),
      },
      pubsub,
    });

    const callback = (err, payload) => {
      try {
        expect(payload.data.testChannelOptions).to.equals('test');
        setTimeout(() => done(), 2);
      } catch (e) {
        setTimeout(() => done(e), 2);
      } finally {
        pubsub.unsubscribe(subscriberId);
      }
    };

    const query = `
      subscription X($repoName: String!) {
        testChannelOptions(repoName: $repoName)
      }`;

    const variables = { repoName: 'graphql-rabbitmq-subscriptions' };

    subManager2.subscribe({ query, operationName: 'X', variables, callback }).then(subId => {
      subscriberId = subId;
      pubsub.publish('comments.graphql-rabbitmq-subscriptions', 'test');
    });
  });

});


describe('Delete Queues After tests', () => {
  it('Delete all test queues', () => {
    const config: IRabbitMqConnectionConfig = {host: '127.0.0.1', port: 5672};
    let f = new RabbitMqConnectionFactory(logger, config);
    // let d = new DefaultQueueNameConfig('testSubscription');
    return f.create().then(c => {
      return c.createChannel().then(ch => {
        return Promise.all([ch.deleteExchange(`${TEST_SUBSCRIPTION}.DLQ.Exchange`),
        ch.deleteExchange(`comments.graphql-rabbitmq-subscriptions.DLQ.Exchange`),
        ch.deleteExchange(`${TRIGGER1}.DLQ.Exchange`),
        ch.deleteExchange(`${TRIGGER2}.DLQ.Exchange`),
        ch.deleteExchange(`${NOT_A_TRIGGER}.DLQ.Exchange`),
        ch.deleteExchange(`${FILTER1}.DLQ.Exchange`),
        ]);
      });
    });
  });
});
