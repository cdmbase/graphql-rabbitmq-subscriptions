import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { mock } from 'simple-mock';
import { ConsoleLogger } from '@cdm-logger/server';
import { IRabbitMqConnectionConfig } from 'rabbitmq-pub-sub';
import {
  parse,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import { isAsyncIterable } from 'iterall';
import { subscribe } from 'graphql/subscription';
import { withFilter } from 'graphql-subscriptions';

import { AmqpPubSub } from '../amqp-pubsub';

const logger = ConsoleLogger.create('integration-test', { level: 'trace' });

chai.use(chaiAsPromised);
const expect = chai.expect;

const FIRST_EVENT = 'FIRST_EVENT';

function buildSchema(iterator) {
  return new GraphQLSchema({
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
          subscribe: withFilter(() => iterator, () => true),
          resolve: root => {
            return 'FIRST_EVENT';
          },
        },
      },
    }),
  });
}

describe('PubSubAsyncIterator', function () {
  const query = parse(`
    subscription S1 {
      testSubscription
    }
  `);

  const config: IRabbitMqConnectionConfig = { host: '127.0.0.1', port: 5672 };
  const pubsub = new AmqpPubSub({ config, logger });
  const origIterator = pubsub.asyncIterator(FIRST_EVENT);
  const returnSpy = mock(origIterator, 'return');
  const schema = buildSchema(origIterator);
  const results = subscribe(schema, query);

  it('should allow subscriptions', () => {
    // tslint:disable-next-line:no-unused-expression
    expect(isAsyncIterable(results)).to.be.true;

    const r = results.next();
    pubsub.publish(FIRST_EVENT, {});

    r.then(res => {
      expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
    });
  });

  it('should clear event handlers', () => {
    // tslint:disable-next-line:no-unused-expression
    expect(isAsyncIterable(results)).to.be.true;

    pubsub.publish(FIRST_EVENT, {});

    results.return()
      .then(res => {
        expect(returnSpy.callCount).to.be.gte(1);
      });
  });
});
