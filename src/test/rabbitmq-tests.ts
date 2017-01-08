import {RabbitMqConnectionFactory,RabbitMqConsumer,RabbitMqProducer, IRabbitMqConnectionConfig, RabbitMqSingletonConnectionFactory} from "rokot-mq-rabbit";
import {ConsoleLogger} from "rokot-log";
import * as Promise from "bluebird";
import { expect, sinon, supertest } from 'rokot-test';
import {DefaultQueueNameConfig} from "rokot-mq-rabbit/dist/common";

const logger = ConsoleLogger.create("rabbitmq-tests", { level: "trace" });
const config: IRabbitMqConnectionConfig = { host: "127.0.0.1", port: 5672};
const invalidConfig: IRabbitMqConnectionConfig = { host: "127.0.0.1", port: 5670};
const queueName = "TestPC";

interface IMessage {
  data: string;
  value: number;
}

describe("RabbitMQSingletonConnectionFactory Test", () => {

  it("Singleton Connection Factory should return singleton connection", () => {
    var f = new RabbitMqSingletonConnectionFactory(logger, config);
    return Promise.all([f.create(), f.create(), f.create()]).then(cons => {
      expect(cons).to.exist;
      expect(cons.length).to.eq(3);

      cons.forEach((con, i) => {
        expect(con).to.exist;
        if (i > 0) {
          expect(cons[0]).to.equal(con);
        }
      })
    })
  })
});

describe("RabbitMq Test", () => {

  it("ConnectionFactory: Invalid Connection config should fail create", () => {
    var factory = new RabbitMqConnectionFactory(logger, invalidConfig);
    return expect(factory.create()).to.eventually.be.rejected.then(v => {
      expect(v).to.exist;
      expect(v.code).to.eq('ECONNREFUSED');
    })
  })

  it("RabbitMqConsumer: Invalid Connection config should fail subscribe", () => {
    var factory = new RabbitMqConnectionFactory(logger, invalidConfig);
    const consumer = new RabbitMqConsumer(logger, factory);
    return expect(consumer.subscribe(queueName, m => {})).to.eventually.be.rejected.then( v => {
      expect(v).to.exist;
      expect(v.code).to.eq("ECONNREFUSED");
    });
  })

  it("RabbitMqProdcuer: Invalid Connection config should fail publish", () => {
    var factory = new RabbitMqConnectionFactory(logger, invalidConfig);
    const producer = new RabbitMqProducer(logger, factory);
    return expect(producer.publish(queueName, m => {})).to.eventually.be.rejected.then(v => {
      expect(v).to.exist;
      expect(v.code).to.eq("ECONNREFUSED");
    })
  });

  it("Consumer should subscribe and dispose ok with simple queue name", () => {
    const spy = sinon.spy();
    const factory = new RabbitMqConnectionFactory(logger, config);
    const consumer = new RabbitMqConsumer(logger, factory);
    return consumer.subscribe<IMessage>(queueName, spy).then( s => Promise.delay(500, s))
      .then(disposer => {
        expect(disposer, "disposer should exist").to.exist;

        expect(spy.callCount).to.be.eq(0, "Consumer spy should not have been called");

        return expect(disposer()).to.eventually.be.fulfilled;
      })
    });

  // it("Consumer should subscribe and dispose ok with queue config", () => {
  //   const spy = sinon.spy();
  //   const factory = new RabbitMqConnectionFactory(logger, config);
  //   const consumer = new RabbitMqConsumer(logger, factory);
  //   return consumer.subscribe<IMessage>(new DefaultQueueNameConfig(queueName))
  // })

  it('Consumer should recieve message from Producer', () => {
    const spy = sinon.spy();
    const factory = new RabbitMqConnectionFactory(logger, config);
    const consumer = new RabbitMqConsumer(logger, factory);
    return consumer.subscribe<IMessage>(queueName, spy).then(disposer => {
      const producer = new RabbitMqProducer(logger, factory);
      const msg:IMessage = { data: "time", value: new Date().getTime() };

      return expect(producer.publish<IMessage>(queueName, msg)).to.eventually.be.fulfilled
        .then(() => Promise.delay(500))
        .then(() => {
        expect(spy.callCount).to.be.eq(1, "Consumer spy should have been called once");
        expect(spy.firstCall.args).to.exist;
        expect(spy.firstCall.args.length).to.be.eq(1, "Spy should have been called with message argument");
        const consumedMsg = spy.firstCall.args[0] as IMessage;
        expect(consumedMsg.data).to.exist;
        expect(consumedMsg.data).to.be.eq(msg.data, "data property mismatch");
        expect(consumedMsg.value).to.exist;
        expect(consumedMsg.value).to.be.eq(msg.value, "value property mismatch");
        disposer();
        })
    })
  });

  it('Consumer should recieve string message from Producer', () => {
    const spy = sinon.spy();
    const factory = new RabbitMqConnectionFactory(logger, config);
    const consumer = new RabbitMqConsumer(logger, factory);
    return consumer.subscribe<IMessage>(queueName, spy).then(disposer => {
      const producer = new RabbitMqProducer(logger, factory);
      const msg:string = "good";

      return expect(producer.publish<string>(queueName, msg)).to.eventually.be.fulfilled
        .then(() => Promise.delay(500))
        .then(() => {
          expect(spy.callCount).to.be.eq(1, "Consumer spy should have been called once");
          expect(spy.firstCall.args).to.exist;
          expect(spy.firstCall.args.length).to.be.eq(1, "Spy should have been called with message argument");
          const consumedMsg = spy.firstCall.args[0] as string;
          expect(consumedMsg).to.exist;
          expect(consumedMsg).to.be.eq(msg, "data property mismatch");
          disposer();
        })
    })
  });

  // it('Consumer should DLQ message from Producer if action fails', () => {
  //   const factory = new RabbitMqConnectionFactory(logger, config);
  //   const consumer = new RabbitMqConsumer(logger, factory);
  //   return consumer.subscribe<IMessage>(queueName, m => Promise.reject(new Error("Test Case Error: to fail consumer subscriber message handler")))
  //     .then(disposer => {
  //       const producer = new RabbitMqProducer(logger, factory);
  //       const msg:IMessage = { data: "time", value: new Date().getTime()};
  //       return producer.publish<IMessage>(queueName, msg)
  //         .then(() => Promise.delay(500))
  //         .then(disposer);
  //     })
  // })

  it('Create Consumer and Producer seperately', () => {
    const spy = sinon.spy();
    const factory = new RabbitMqConnectionFactory(logger, config);
    const consumer = new RabbitMqConsumer(logger, factory);
    const producer = new RabbitMqProducer(logger, factory);
    const msg:IMessage = { data: "time", value: new Date().getTime()};
    expect(producer.publish<IMessage>(queueName, msg)).to.eventually.be.fulfilled.then( v => {
     // expect(v).to.exist;
      console.log(v);
    });
     consumer.subscribe<IMessage>(queueName, spy)
      .then((disposer) => {
      expect(disposer).to.exist;
        expect(spy.callCount).to.be.eq(1, "Consumer spy should have been called once");
        expect(spy.firstCall.args).to.exist;
        expect(spy.firstCall.args.length).to.be.eq(1, "Spy should have been called with message argument");
        const consumedMsg = spy.firstCall.args[0] as IMessage;
        expect(consumedMsg.data).to.exist;
        expect(consumedMsg.data).to.be.eq(msg.data, "data property mismatch");
        expect(consumedMsg.value).to.exist;
        expect(consumedMsg.value).to.be.eq(msg.value, "value property mismatch");
        console.log("Consumed message" + consumedMsg);
      return expect(disposer()).to.eventually.be.fulfilled;
      })
  })
});

describe("Delete Queues After tests", () => {
  it("Delete all test queues", () => {
    var f = new RabbitMqConnectionFactory(logger, config);
    var d = new DefaultQueueNameConfig(queueName);
    return f.create().then(c => {
      return c.createChannel().then(ch=>{
        return Promise.all([ch.deleteExchange(d.dlx), ch.deleteQueue(d.dlq), ch.deleteQueue(d.name)]).return()
      })
    })
  })
});
