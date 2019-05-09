import { AmqpPubSub } from '../amqp-pubsub';
import { logger } from './logger';
import { isAsyncIterable } from 'iterall';
import 'jest';
const customLogger = logger.child({ className: '---------------async-iterator.test------------' });
describe('AsyncIterator', () => {
    it('should expose valid asyncIterator for a specific event', () => {
        const eventName = 'test1';
        const ps = new AmqpPubSub({ logger });
        const iterator = ps.asyncIterator(eventName);
        expect(iterator).toBeDefined();
        expect(isAsyncIterable(iterator)).toBeTruthy();
    });

    it('should trigger event on asyncIterator when published', done => {
        const eventName = 'test2';
        const ps = new AmqpPubSub({ logger });
        const iterator = ps.asyncIterator(eventName);

        iterator.next().then(result => {
            customLogger.trace('result: (%j)', result);
            try {
                expect(result).toBeDefined();
                expect(result.value).toBeDefined();
                expect(result.done).toBeDefined();
                done();
            } catch (e) {
                done.fail(e);
            }

        });
        ps.publish(eventName, { test: true });
    });

    it('should not trigger event on asyncIterator when publishing other event', () => {
        const eventName = 'test3';
        const ps = new AmqpPubSub({ logger });
        const iterator = ps.asyncIterator('test');
        const spy = jest.fn();
        iterator.next().then(spy);
        ps.publish(eventName, { test: true });
        expect(spy).not.toBeCalled();
    });

    it('register to multiple events', done => {
        const eventName = 'test4';
        const ps = new AmqpPubSub({ logger });
        const iterator = ps.asyncIterator(['test', 'test2']);
        const spy = jest.fn();

        iterator.next().then(() => {
            spy();
            expect(spy).toHaveBeenCalled();
            done();
        });
        ps.publish(eventName, { test: true });
    });

    it('should not trigger event on asyncIterator already returned', done => {
        const eventName = 'test5';
        const ps = new AmqpPubSub({ logger });
        const iterator = ps.asyncIterator(eventName);

        iterator.next().then(result => {
            customLogger.trace('result: (%j)', result);

            try {
                expect(result).toBeDefined();
                expect(result.value).toBeDefined();
                expect(result.done).toBeFalsy();
            } catch (e) {
                done.fail(e);
            }
        });

        ps.publish(eventName, { test: true });

        iterator.next().then(result => {
            customLogger.trace('result: (%j)', result);
            try {
                expect(result).toBeDefined();
                expect(result.value).not.toBeDefined();
                expect(result.done).toBeTruthy();
                done();
            } catch (e) {
                done.fail(e);
            }
        });

        iterator.return();
        ps.publish(eventName, { test: true });
    });
});
