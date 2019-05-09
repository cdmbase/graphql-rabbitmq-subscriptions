
import { isAsyncIterable } from 'iterall';
import { AmqpPubSub } from '../amqp-pubsub';
import {
    parse,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
} from 'graphql';
import { withFilter } from 'graphql-subscriptions';
import { subscribe } from 'graphql/subscription';
import { logger } from './logger';

const FIRST_EVENT = 'FIRST_EVENT';

const defaultFilter = (payload) => true;

function buildSchema(iterator, filterFn = defaultFilter) {
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
                    subscribe: withFilter(() => iterator, filterFn),
                    resolve: root => {
                        return 'FIRST_EVENT';
                    },
                },
            },
        }),
    });
}

describe('GraphQL-JS asyncIterator', () => {
    let originalTimeout;

    beforeAll(function () {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
    });
    afterAll(function () {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    });
    it('should allow subscriptions',  (done) => {
        const query = parse(`
        subscription S1 {
            testSubscription
            }
    `);
        const pubsub = new AmqpPubSub({ logger });
        const origIterator = pubsub.asyncIterator(FIRST_EVENT);
        const orig2Iterator = pubsub.asyncIterator('TEST123');

        const schema = buildSchema(origIterator);
        const results = subscribe(schema, query);
        const payload1 = results.next();

        expect(isAsyncIterable(results)).toBeTruthy();

        const r = payload1.then(res => {
            expect(res.value.data.testSubscription).toEqual('FIRST_EVENT');
            done();
        });

        // const val = await payload1;
        // console.log(val);
        // await r;
            setTimeout(() => {
                pubsub.publish(FIRST_EVENT, { test: { file: true } });
                
            }, 10);
        // return r;
    });

    // it('should detect when the payload is done when filtering', (done) => {
    //     const query = parse(`
    //     subscription S1 {
    //         testSubscription
    //     }
    //     `);

    //     const pubsub = new AmqpPubSub({ logger });
    //     const origIterator = pubsub.asyncIterator(FIRST_EVENT);

    //     let counter = 0;

    //     const filterFn = () => {
    //         counter++;

    //         if (counter > 10) {
    //             const e = new Error('Infinite loop detected');
    //             done(e);
    //             throw e;
    //         }
    //         return false;
    //     };

    //     const schema = buildSchema(origIterator, filterFn);

    //     const results = subscribe(schema, query);
    //     expect(isAsyncIterable(results)).toBeTruthy();

    //     results.next();
    //     results.return();

    //     pubsub.publish(FIRST_EVENT, {});

    //     setTimeout(_ => {
    //         done();
    //     }, 500);
    // });

    // it('should clear event handlers', () => {
    //     const query = parse(`
    //     subscription S1 {
    //         testSubscription
    //     }
    //     `);

    //     const pubsub = new AmqpPubSub({ logger });
    //     const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    //     const returnSpy = jest.spyOn(origIterator, 'return');
    //     const schema = buildSchema(origIterator);

    //     const results = subscribe(schema, query);
    //     const end = results.return();

    //     const r = end.then(res => {
    //         expect(returnSpy).toBeCalled();
    //     });

    //     pubsub.publish(FIRST_EVENT, {});

    //     return r;
    // });
});

