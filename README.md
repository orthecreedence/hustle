Hustle: A persistent javascript queuing/messaging library
=============================================================
Hustle is a javascript queuing and messaging library built on top of IndexedDB.

The idea is that sometimes you have two pieces of an application that need to
talk to each other, but don't (or shouldn't) have access to each other's memory.
Hustle lets them talk through IndexedDB, giving your app a framework for
handling tasks and passing messages, all persisted.

If the use case sounds very specific, it is. Hustle was built to make the
syncing system in [Turtl](https://turtl.it) more scalable by breaking out
messaging and queuing into a separate system than having it married to the main
database. It shines when you have an app that works offline but syncs to a
server somewhere: you can queue up changes to your local data and have them
synced to your API when a connection becomes available without having to worry
about losing your jobs/messages between app restarts.

- [Getting started](#getting-started)
- [API](#api)
- [Exceptions](#exceptions)
- [Promises](#promises)
- [Tests](#tests)
- [License](#license)

Getting started
---------------
```javascript
var hustle   =   new Hustle({
    tubes: ['jobs'],
    db_version: 2       // should increase whenever tubes change
});
```

Create our Hustle object. This provides the interface for all our messaging and
queuing needs. Note that we specify `tubes`. Think of a tube as a *table* in a
database: it logically separates the different kinds of queue items you'll be
passing through Hustle. Throughout the [Queue API](#hustlequeue), you're able
to specify which tube you're operating on. If undefined, the `default` tube is
used (which is always created on init).

```javascript
hustle.open({
    success: function() {
        console.log('database opened!');
    },
    error: function(e) {
        console.error('error opening database: ', e);
    }
});
```

[Open](#hustleopen) the Hustle database so we can start messaging and queueing.

### Queuing

```javascript
hustle.Queue.put({task: 'rob_bank'}, {
    tube: 'jobs',       // if unspecified, will use tube "default"
    success: function(item) {
        console.log('added item: ', item.id);
    },
    error: function(e) {
        console.error('failed to add job: ', e);
    }
});
```

Now we [put](#hustlequeueput) a new message into the queue. The first argument,
`{task: 'rob_bank'}`, is our message. This can be any arbitrary javascript
object. Once complete, our `success` callback is given a queue item (with a
queue-assigned `id` value we can use to reference the message with later on).

```javascript
hustle.Queue.reserve({
    tube: 'jobs',       // if unspecified, will use tube "default"
    success: function(item) {
        console.log('heyyy man...you got a job!', item);
    },
    error: function(e) {
        console.error('failed to reserve job: ', e);
    }
});
```

Now we [reserve](#hustlequeuereserve) an item. This removes the job from its
"ready" state and puts it into a reserved state, meaning that nobody else can
reserve that job unless it's [released](#hustlequeuerelease) back onto the tube.

Note that reserve's `success` function is triggered even if no items are found,
so be sure to check if `item` is null before using.

```javascript
hustle.Queue.delete(item.id, {
    success: function() {
        console.log('job '+ item.id +' deleted.');
    },
    error: function(e) {
        console.error('failed to delete job: ', e);
    }
});
```

Once you are satisfied that a job has fulfilled its purpose, it makes sense to
[delete](#hustlequeuedelete) it so it doesn't sit there gumming up your reserved
items. Note that we don't have to specify a tube for `delete`...the command
works across all tubes, as all job IDs are unique across tubes.

```javascript
var consumer = new hustle.Queue.Consumer(function(job) {
    console.log('got job! ', job);
    hustle.Queue.delete(job.id);
}, { tube: 'jobs' });
```

A [consumer](#hustlequeueconsumer) listens to a particular tube and calls the
given function for each job it gets. It will do this indefinitely until
`consumer.stop()` is called.

API
---

- [Hustle class](#hustle-class)
- [Hustle.open](#hustleopen)
- [Hustle.close](#hustleclose)
- [Hustle.is\_open](#hustleis_open)
- [Hustle.wipe](#hustlewipe)
- [Hustle.Queue](#hustlequeue)
  - [Queue item format](#queue-item-format)
  - [Hustle.Queue.peek](#hustlequeuepeek)
  - [Hustle.Queue.put](#hustlequeueput)
  - [Hustle.Queue.reserve](#hustlequeuereserve)
  - [Hustle.Queue.delete](#hustlequeuedelete)
  - [Hustle.Queue.release](#hustlequeuerelease)
  - [Hustle.Queue.bury](#hustlequeuebury)
  - [Hustle.Queue.kick](#hustlequeuekick)
  - [Hustle.Queue.kick\_job](#hustlequeuekick_job)
  - [Hustle.Queue.touch](#hustlequeuetouch)
  - [Hustle.Queue.count\_ready](#hustlequeuecount_ready)
  - [Hustle.Queue.Consumer](#hustlequeueconsumer)

### Hustle class
```javascript
var hustle   =   new Hustle({
    db_name: 'hustle',
    db_version: 1,
    housekeeping_delay: 1000,
    message_lifetime: 10000,
    tubes: ['default']
});
```
Creates a Hustle object. Note that the tubes the queue uses *must* be specified.
You cannot use queue tubes that haven't been declared.

- `db_name` specifies the name we want to open the Hustle queue onto. Default:
`"hustle"`
- `db_version` is the IndexedDB version number to open the database under. This
should change whenever your tubes change *or else* (or else what? or else they
will probably not be updated in the schema). Default: `1`
- `maintenance_delay` is a value (in ms) that determines how often this Hustle
object will do DB maintenance (moving expired/delayed jobs back to the ready
state, mainly). Default: `1000`
- `tubes` specifies what tubes we want to be present on [open](#hustleopen).
Default: `['default']`

### Hustle.open
```javascript
hustle.open({
    success: function(event) { ... },
    error: function(event) { ... }
});
```

Opens/creates/upgrades the Hustle DB.

- `success` is fired when the IndexedDB store has been opened successfully and
is ready for pounding.
- `error` is fired if something bad happens during `open`.

### Hustle.close
```javascript
hustle.close()
  => boolean
```

Closes the Hustle database. Returns `true` if the DB was closed, otherwise
returns `false` (if the DB wasn't open).

This function is synchronous.

### Hustle.is\_open
```javascript
hustle.is_open()
  => boolean
```

This function is synchronous.

### Hustle.wipe
```javascript
hustle.wipe();
```

Closes the Hustle database and obliterates it. Very useful for debugging apps
*or* if you have no interest in actually persisting, you can call `wipe()` each
time your app loads just before you call [open](#hustleopen).

This function is synchronous.

### Hustle.Queue
The Hustle queue system allows jobs to be atomically grabbed and operated on
by any number of workers. Each job can only be reserved by one worker at a time.

Hustle.Queue takes heavy inspiration from [beanstalkd](http://kr.github.io/beanstalkd/),
in fact most functions have the same names as the [beanstalkd protocol](https://github.com/kr/beanstalkd/blob/master/doc/protocol.txt).

#### Queue item format
All items added to the Hustle queue follow this basic format:
```javascript
{
    // the item's Hustle-assigned unique id
    id: 6969,

    // the item's priority (lower is more important, defaults to 1024)
    priority: 1024,

    // the item's user-specified data payload
    data: ...,

    // how old the item is
    age: 0,

    // how many times this item has been reserved
    reserves: 0,

    // how many times this item has been released
    releases: 0,

    // how many times this item has timed out
    timeouts: 0,

    // how many times this item has been buried
    buries: 0,

    // how many times this item has been kicked
    kicks: 0,

    // how many seconds left this job has to run before expiring (and being moved to the ready state)
    time_left: 0,

    // what state this item is in (set by peek)
    state: 'ready|buried|reserved',

    // when this item was created (new Date().getTime())
    created: 1391835692616
}
```

#### Hustle.Queue.peek
```javascript
hustle.Queue.peek(item_id, {
    success: function(item) { ... },
    error: function(event) { ... }
});
```

Grabs a queue item by ID. `peek` checks all tables (reserved, buried, and *all*
tubes) for the item. This is fairly simple because every item in the Hustle DB
has a unique ID.

Items grabbed by `peek` follow the [standard item format](#queue-item-format).

Note that peek's `success` function is triggered even if the item isn't found,
so be sure to check if `item` is null before using.

- `success` is fired when the lookup is done. The first argument is the queue
item (or `null` if not found). The item will have `item.tube` and `item.state`
set appropriately.
- `error` is fired if there was a problem looking up that queue item.

#### Hustle.Queue.put
```javascript
hustle.Queue.put(job_data, {
    tube: 'default',
    priority: 1024,
    delay: 1000,
    ttr: 20,
    success: function(item) { ... },
    error: function(e) { ... }
});
```

Puts a new item into the queue.

- `tube` specifies the tube we're putting this item into. Defaults to "default".
- `priority` specifies this item's priority. `0` is the most important, with
anything higher getting less important. Defaults: `1024`
- `delay` is how many seconds to wait before the job becomes ready. Default: `0`
- `ttr` is how many seconds the job has to live once reserved. If this many
seconds passes before the job is [deleted](#hustlequeuedelete) or [released](#hustlequeuerelease),
the job is automatically put back into the ready state. Note that you can reset
the ttr timer using the [touch](#hustlequeuetouch) command. Set to `0` to
disable the ttr. Default: `0`
- `success` is fired when the job has been added to the queue. The first
argument is the full item that was passed back (which is in the [standard format](#queue-item-format)).
You may want to make note of the item's ID (`item.id`) because this will allow
you to reference the job later on if needed (via [peek](#hustlequeuepeek),
[delete](#hustlequeuedelete), [bury](#hustlequeuebury), etc).
- `error` is fired when there was a problem adding the item to the queue.

#### Hustle.Queue.reserve
```javascript
hustle.Queue.reserve({
    tube: 'default',
    success: function(item) { ... },
    error: function(e) { ... }
});
```

Pulls the next available item off of the specified tube.

Note that reserve's `success` function is triggered even if no items are found,
so be sure to check if `item` is null before using.

- `tube` specifies which tube to pull from. Defaults to "default".
- `success` is fired when the reserve command finishes. The first argument is
the job we pulled off the queue (or `null` of the tube is empty). It is in the
[standard format](#queue-item-format). You'll want to make note of the item's ID
(`item.id`) because it will let you [delete](#hustlequeuedelete) the job once you no longer
need it.
- `error` is fired if there was a problem reserving the item.

#### Hustle.Queue.delete
```javascript
hustle.Queue.delete(item_id, {
    success: function(item) { ... },
    error: function(e) { ... }
});
```

Deletes the item with the given ID. Because item IDs are unique across all
tubes, there's no need to specify the tube we're deleting from.

It's important that if you get a job via [reserve](#hustlequeuereserve) and it completes
successfully that you then `delete` the job. If you don't do this, you're going
to have jobs living forever in your reserved table gumming things up. If you
really want to save a particular job for later inspection/logging, consider
[burying](#hustlequeuebury) it.

- `success` is fired when complete. The first argument is the item (in the
[standard format](#queue-item-format)) that was deleted or `null` if the item
wasn't found.
- `error` is fired when there was a problem deleting the item.

#### Hustle.Queue.release
```javascript
hustle.Queue.release(item_id, {
    priority: 1024,
    delay: 0,
    success: function() { ... },
    error: function(e) { ... }
});
```

Releases an item back into the queue. This un-reserves an item and makes it
available on its original tube for others to consume via [reserve](#hustlequeuereserve).

- `priority` specifies the new priority to set on the item being released. If
unspecified, will default to the item's original priority. Default: `1024`
- `delay` specifies how many seconds the jb must wait before becoming ready
after releasing it. Default: `0`
- `success` is fired when the item is released back into the queue.
- `error` is fired if something went wrong while releasing.

#### Hustle.Queue.bury
```javascript
hustle.Queue.bury(item_id, {
    priority: 1024,
    success: function() { ... },
    error: function(e) { ... }
});
```

Calling `bury` moves an item into cold storage. It's a great way to keep items
that fail a lot from plugging up your queue. You can read properties like
[item.reserves](#queue-item-format) and determine how many times a job has been
[reserved](#hustlequeuereserve) and [released](#hustlequeuerelease) and add logic to say "if this job
has been reserved over 5 times, bury it for later."

Once an item is buried, it can only be released back into the queue by using
[kick](#hustlequeuekick) or [kick\_job](#hustlequeuekick_job).

Items are buried in FIFO order.

- `priority` allows you to re-assign the item's priority prior to being buried.
If unspecified, will use the item's current priority value.
- `success` is fired when the bury operation is finished.
- `error` is fired if something goes wrong while burying.

#### Hustle.Queue.kick
```javascript
hustle.Queue.kick(num, {
    success: function(count) { ... },
    error: function(e) { ... }
});
```

Kick removes the first `num` items from the [bury](#hustlequeuebury) state and puts them
into a ready state in their respective tubes.

- `num` is the number of jobs to kick
- `success` is fired when the operation completed, with the first argument being
the actual number of jobs that were kicked.
- `error` is fired if something goes wrong while kicking.

#### Hustle.Queue.kick\_job
```javascript
hustle.Queue.kick_job(item_id, {
    success: function() { ... },
    error: function(e) { ... }
});
```

Kicks a specific item by id, as opposed to kicking the first N items (like
[kick](#hustlequeuekick)).

- `item_id` is the ID of the item we want to kick.
- `success` is fired when the operation completes.
- `error` is fired if something goes wrong while kicking.

#### Hustle.Queue.touch
```javascript
hustle.Queue.touch(id, {
    success: function() { ... },
    error: function(e) { ... }
});
```

Reset an item's time to run value (ie reset the timer that moves it to the ready
state if it isn't released/deleted within a certain amount of time).

- `id` specifies the ID of the item we're resetting the timer for.
- `success` is fired when finished.
- `error` is fired when something goes wrong.

#### Hustle.Queue.count\_ready
```javascript
hustle.Queue.count_ready(tube, {
    success: function(count) { ... },
    error: function(e) { ... }
});
```

Count the number of *ready* items in a tube.

- `tube` specifies the tube we want to about the items for.
- `success` is fired when finished, with the first argument being the item
count.
- `error` is fired when something goes wrong.

#### Hustle.Queue.Consumer
```javascript
var consumer = new hustle.Queue.Consumer(consume_fn, {
    tube: 'default',
    delay: 100,
    enable_fn: function() { ... },
    error: function(e) { ... }
});
```

The Consumer class provides an interface to watch a particular tube and call a
function for each item that is [put](#hustlequeueput) into it. It currently
works by polling every X milliseconds (100 by default).

- `consume_fn` is a function, of one argument, which will be called for each
job entered into the tube. The value passed in is a [queue item](#queue-item-format).
- `tube` is the name of the tube we want to devour (default is "default").
- `delay` is the delay (in ms) between polls to the tube. IndexedDB doesn't have
a blocking interface, so polling is the only option, as far as I know.
- `enable_fn` is an optional function you pass that the consumer calls before
each time it polls for queue items. If the function returns `false` then the
polling is stopped.
- `error` is triggered if there are any problems while consuming.

The returned object has two methods:

- `consumer.start()` starts the consumer. Note that it starts on instantiation,
so you don't need to call this unless you previously called `consumer.stop()`.
- `consumer.stop()` stops the consumer from polling the queue. Can be started
again via `consumer.start()`.

Exceptions
----------
This details some of the exceptions that can be thrown by Hustle. These classes
are available in the static `Hustle.Error` namespace.

### Hustle.Error.DBClosed
Thrown when you try to do any operations in Hustle and the database is closed.
Make sure you [open](#hustleopen) it first!

### Hustle.Error.DBOpened
Thrown when you try to open the DB and it's already opened through the current
Hustle object.

### Hustle.Error.BadTube
Thrown when you try to access a tube that doesn't exist. Be sure to declare your
tubes when [instantiating Hustle](#hustle-class) *and* bump up the `db_version`
property.  

### Hustle.Error.BadID
Thrown when a bad ID value (like `null`) is passed to a function that takes an
ID (like [peek](#hustlequeuepeek), [delete](#hustlequeuedelete), etc).

### Hustle.Error.NotFound
Thrown when an operation is performed on an item that doesn't exist (or isn't in
the location it's supposed to be in).

Promises
--------
Hustle allows using [bluebird](https://github.com/petkaantonov/bluebird) for a
promise API.

The promise API is activated by calling `hustle.promisify()`:

```javascript
var hustle = new Hustle();
hustle.promisify();
```

This replaces *all* public API functions that take `success`/`error` options
(any non-synchronous function) to return a promise object instead.

### Examples

```javascript
var hustle = new Hustle();
hustle.promisify();
hustle.open().then(function() {
    return hustle.Queue.put('fetch me my slippers');
}).then(function() {
    return hustle.Queue.reserve();
}).then(function(item) {
    console.log("WHAT?? I don't take orders from you...");
    return hustle.Queue.delete(item.id)
}).catch(function(e) {
    console.error('something went wrong: ', e);
});
```

Notice how we can chain a number of calls at the top level and have only one
error handler for the lot. Very nice.

Tests
-----
Just navigate ur browser to `Hustle/test/` and let the *magic happen*.

License
-------
MIT. __JOY.__


