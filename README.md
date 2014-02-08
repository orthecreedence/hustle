Hustle: A javascript queuing library persisted over IndexedDB
=============================================================
Hustle is a queuing system for Javascript built on top of IndexedDB. It takes
heavy inspiration from [beanstalkd](http://kr.github.io/beanstalkd/).

The idea is that sometimes you have two pieces of an application that need to
talk to each other, but don't (or shouldn't) have access to each other's memory.
Hustle lets them talk by passing messages, giving the pieces of your app a
framework for handling tasks.

Everything in Hustle is asynchronous so until enough people bug me to implement
futures or promises or deferreds or whatever the hell they're called this week,
you're stuck in callback hell.

- [Getting started](#getting-started)
- [API](#api)
- [Tests](#tests)
- [License](#license)

Getting started
---------------
```javascript
var queue   =   new Hustle({ tubes: ['jobs'] });
```

Here we create a new Hustle queue. Note that we specify `tubes`. Think of a tube
as a *table* in a database: it logically separates the different kinds of
messages yuo'll be passing through Hustle. Throughout the API, you're able to
specify which tube you're operating on. If undefined, the `default` tube is used
(which is always created on init).

```javascript
queue.open({
    success: function() {
        console.log('queue opened!');
    },
    error: function(e) {
        console.error('error opening queue: ', e);
    }
});
```

```javascript
queue.put({task: 'rob_bank'}, {
    tube: 'jobs',       // if unspecified, will use tube "default"
    success: function(item) {
        console.log('added item: ', item.id);
    },
    error: function(e) {
        console.error('failed to add job: ', e);
    }
});
```

Now we put a new message into the queue. The first argument, `{task: 'rob_bank'}`,
is our message. This can be any arbitrary javascript object. Once complete, our
`success` callback is given a queue item (with a queue-assigned `id` value we
can use to reference the message with later on).

```javascript
queue.reserve({
    tube: 'jobs',       // if unspecified, will use tube "default"
    success: function(item) {
        console.log('heyyy man...you got a job!', item);
    },
    error: function(e) {
        console.error('failed to reserve job: ', e);
    }
});
```

Now we "reserve" an item. This removes the job from its "ready" state and puts
it into a reserved state, meaning that nobody else can reserve that job unless
it's [released](#release) back onto the tube.

```javascript
queue.delete(item.id, {
    success: function() {
        console.log('job '+ item.id +' deleted.');
    },
    error: function(e) {
        console.error('failed to delete job: ', e);
    }
});
```

Once you are satisfied that a job has fulfilled its purpose, it makes sense to
delete it so it doesn't sit there gumming up your reserved items. Note that we
don't have to specify a tube for `del`...the command works across all tubes, as
all job IDs are unique across tubes.

That should get you started!

API
---
The Hustle API tries to stay as close to beanstalkd as possible, so for those of
you familiar with the beanstalkd protocol, this should all make sense. Either
way, this will describe how to effectively use Hustle.

It's important to note: time-to-run (`ttr`) and job delaying are not yet
implemented.

- [Queue item format](#queue-item-format)
- [Hustle class](#hustle)
- [Hustle.open](#open)
- [Hustle.close](#close)
- [Hustle.wipe](#wipe)
- [Hustle.peek](#peek)
- [Hustle.put](#put)
- [Hustle.reserve](#reserve)
- [Hustle.delete](#delete)
- [Hustle.release](#release)
- [Hustle.bury](#bury)
- [Hustle.kick](#kick)
- [Hustle.kick\_job](#kick-job)
- [Hustle.count\_ready](#count-ready)
- [Hustle.consume](#consume)

### Queue item format
All items added to the Hustle queue follow this basic format:
```javascript
{
    id: 6969,               // the item's Hustle-assigned unique id
    priority: 1024,         // the item's priority (lower is more important, defaults to 1024)
    data: { ... },          // the item's user-specified data payload
    age: 0,                 // how old the item is (unimplemented)
    reserves: 0,            // how many times this item has been reserved
    releases: 0,            // how many times this item has been released
    timeouts: 0,            // how many times this item has timed out (unimplemented)
    buries: 0,              // how many times this item has been buried
    kicks: 0,               // how many times this item has been kicked
    created: 1391835692616  // when this item was created (new Date().getTime())
}
```

Note that `timeouts` is unimplemented because `ttr` is not currently implemented
in the Hustle lib.

### Hustle
```javascript
var queue   =   new Hustle({
    db_name: 'hustle',
    tubes: ['tube1', 'tube2', ...]
});
```
Creates a Hustle object.

- `db_name` specifies the name we want to open the Hustle queue onto. Defaults
to "hustle".
- `tubes` specifies what tubes we want to be present on [open](#open).

### open
```javascript
queue.open({
    success: function(event) { ... },
    error: function(event) { ... }
});
```

Opens/creates/upgrades the Hustle DB.

- `success` is fired when the IndexedDB store has been opened successfully and
is ready for pounding.
- `error` is fired if something bad happens during `open`.

### close
```javascript
queue.close();
```

Closes the Hustle database. Returns `true` if the DB was closed, otherwise
returns `false` (if the DB wasn't open).

### wipe
```javascript
queue.wipe();
```

Closes the Hustle database and obliterates it. Very useful for debugging apps
*or* if you have no interest in actually persisting your queue items, you can
call `wipe()` each time your app loads just before you call [open](#open).

### peek
```javascript
queue.peek(item_id, {
    success: function(item) { ... },
    error: function(event) { ... }
});
```

Grabs a queue item by ID. `peek` checks all tables (reserved, buried, and *all*
tubes) for the item. This is fairly simple because every item in the Hustle DB
has a unique ID.

Items grabbed by `peek` follow the [standard item format](#queue-item-format).

- `success` is fired when the lookup is done. The first argument is the queue
item (or `null` if not found). The item will have `item.tube` and `item.state`
set appropriately.
- `error` is fired if there was a problem looking up that queue item.

### put
```javascript
queue.put(job_data, {
    tube: 'default',
    priority: 1024,
    success: function(item) { ... },
    error: function(e) { ... }
});
```

Puts a new item into the queue.

- `tube` specifies the tube we're putting this item into. Defaults to "default".
- `priority` specifies this item's priority. `0` is the most important, with
anything higher getting less important. Defaults to `1024`.
- `success` is fired when the job has been added to the queue. The first
argument is the full item that was passed back (which is in the [standard format](#queue-item-format)).
You may want to make note of the item's ID (`item.id`) because this will allow
you to reference the job later on if needed (via [peek](#peek), [delete](#delete),
[bury](#bury), etc).
- `error` is fired when there was a problem adding the item to the queue.

### reserve
```javascript
queue.reserve({
    tube: 'default',
    success: function(item) { ... },
    error: function(e) { ... }
});
```

Pulls the next available item off of the specified tube.

- `tube` specifies which tube to pull from. Defaults to "default".
- `success` is fired when the reserve command finishes. The first argument is
the job we pulled off the queue (or `null` of the tube is empty). It is in the
[standard format](#queue-item-format). You'll want to make note of the item's ID
(`item.id`) because it will let you [delete](#delete) the job once you no longer
need it.
- `error` is fired if there was a problem reserving the item.

### delete
```javascript
queue.delete(item_id, {
    success: function(item) { ... },
    error: function(e) { ... }
});
```

Deletes the item with the given ID. Because item IDs are unique across all
tubes, there's no need to specify the tube we're deleting from.

It's important that if you get a job via [reserve](#reserve) and it completes
successfully that you then `delete` the job. If you don't do this, you're going
to have jobs living forever in your reserved table gumming things up. If you
really want to save a particular job for later inspection/logging, consider
[burying](#bury) it.

- `success` is fired when complete. The first argument is the item (in the
[standard format](#queue-item-format)) that was deleted or `null` if the item
wasn't found.
- `error` is fired when there was a problem deleting the item.

### release
```javascript
queue.release(item_id, {
    priority: 1024,
    success: function() { ... },
    error: function(e) { ... }
});
```

Releases an item back into the queue. This un-reserves an item and makes it
available on its original tube for others to consume via [reserve](#reserve).

- `priority` specifies the new priority to set on the item being released. If
unspecified, will default to the item's original priority.
- `success` is fired when the item is released back into the queue.
- `error` is fired if something went wrong while releasing.

### bury
```javascript
queue.bury(item_id, {
    priority: 1024,
    success: function() { ... },
    error: function(e) { ... }
});
```

Calling `bury` moves an item into cold storage. It's a great way to keep items
that fail a lot from plugging up your queue. You can read properties like
[item.reserves](#queue-item-format) and determine how many times a job has been
[reserved](#reserve) and [released](#release) and add logic to say "if this job
has been reserved over 5 times, bury it for later."

Once an item is buried, it can only be released back into the queue by using
[kick](#kick) or [kick\_job](#kick-job).

Items are buried in FIFO order.

- `priority` allows you to re-assign the item's priority prior to being buried.
If unspecified, will use the item's current priority value.
- `success` is fired when the bury operation is finished.
- `error` is fired if something goes wrong while burying.

### kick
```javascript
queue.kick(num, {
    success: function(count) { ... },
    error: function(e) { ... }
});
```

Kick removes the first `num` items from the [bury](#bury) state and puts them
into a ready state in their respective tubes.

- `num` is the number of jobs to kick
- `success` is fired when the operation completed, with the first argument being
the actual number of jobs that were kicked.
- `error` is fired if something goes wrong while kicking.

### kick\_job
```javascript
queue.kick_job(item_id, {
    success: function() { ... },
    error: function(e) { ... }
});
```

Kicks a specific item by id, as opposed to kicking the first N items (like
[kick](#kick)).

- `item_id` is the ID of the item we want to kick.
- `success` is fired when the operation completes.
- `error` is fired if something goes wrong while kicking.

### count\_ready
```javascript
queue.count_ready(tube, {
    success: function(count) { ... },
    error: function(e) { ... }
});
```

Count the number of *ready* items in a tube.

- `tube` specifies the tube we want to about the items for.
- `success` is fired when finished, with the first argument being the item
count.
- `error` is fired when something goes wrong.

### consume
```javascript
queue.consume(tube, consume_fn, {
    delay: 100
}) => function
```

Consume provides an interface to watch a particular tube and call a function for
each item that is [put](#put) into it. It currently works by polling every X
milliseconds (100 by default).

- `tube` is the name of the tube we want to devour.
- `consume_fn` is a function, of one argument, which will be called for each
job entered into the tube. The value passed in is a [queue item](#queue-item-format).
- `delay` is the delay (in ms) between polls to the tube. IndexedDB doesn't have
a blocking interface, so polling is the only option, as far as I know.

Tests
-----
Just navigate ur browser to `Hustle/test/` and let the magic happen.

License
-------
MIT. __YAY.__


