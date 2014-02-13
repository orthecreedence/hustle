describe('Hustle', function() {
	var hustle	=	new Hustle();

	it('has known exported functions', function() {
		var main_exports	=	['open', 'close', 'is_open', 'wipe', 'promisify'];
		var queue_exports	=	['peek', 'put', 'reserve', 'delete', 'release', 'bury', 'kick', 'kick_job', 'count_ready', 'Consumer']; 
		var pubsub_exports	=	['publish', 'Subscriber']; 
		for(var i = 0; i < main_exports.length; i++)
		{
			expect(typeof hustle[main_exports[i]]).toBe('function');
		}
		for(var i = 0; i < queue_exports.length; i++)
		{
			expect(typeof hustle.Queue[queue_exports[i]]).toBe('function');
		}
		for(var i = 0; i < pubsub_exports.length; i++)
		{
			expect(typeof hustle.Pubsub[pubsub_exports[i]]).toBe('function');
		}
	});

	it('is awesome', function() {
		expect(true).toBe(true);
	});
});

describe('Hustle queue operations', function() {
	var hustle	=	new Hustle({
		tubes: ['incoming', 'outgoing'],
	});

	// stores some of the ids of our queue items
	var ids	=	{
		first: null,
		priority: null
	};

	beforeEach(function(done) {
		setTimeout(function() {
			done();
		}, 1000);
	});

	it('can clear a database', function(done) {
		var res	=	hustle.wipe();
		expect(res).toBe(true);
		done();
	});

	it('can open a database', function(done) {
		var db	=	null;
		var finished	=	function()
		{
			expect(db instanceof IDBDatabase).toBe(true);
			expect(hustle.is_open()).toBe(true);
			done();
		};
		hustle.open({
			success: function(e) {
				db	=	e.target.result;
				finished();
			},
			error: function(e) {
				console.error('err: ', e);
				finished();
			}
		});
	});

	it('can add queue items', function(done) {
		var num_added	=	0;
		var num_items	=	10;
		var errors		=	[];
		var pri_sum		=	0;
		var next		=	function()
		{
			if(num_added < num_items) return false;
			expect(pri_sum).toBe(((num_items - 1) * 1024) + 1000);
			expect(typeof ids.priority).toBe('number');
			expect(errors.length).toBe(0);
			done();
		}
		var finish_item	=	function(item)
		{
			expect(typeof item.id).toBe('number');
			num_added++;
			pri_sum	+=	item.priority;
			if(item.priority < 1024)
			{
				ids.priority	=	item.id;
			}
			else
			{
				if(!ids.first) ids.first = item.id;
			}
			next();
		};

		var error	=	function(e)
		{
			num_added++;
			console.error('err: ', e);
			errors.push(e);
			next();
		};

		for(var i = 0; i < num_items; i++)
		{
			var data	=	{task: 'say_hello_'+ i};
			hustle.Queue.put(data, {
				tube: 'outgoing',
				// add a higher-priority item
				priority: i == 5 ? 1000 : 1024,
				success: function(item) {
					finish_item(item);
				},
				error: error
			});
		}
	});

	it('can reserve an item', function(done) {
		var id		=	null;
		var error	=	false;
		var finish	=	function()
		{
			// should be the lowest priority item
			expect(id).toBe(ids.priority);
			expect(error).toBe(false);
			done();
		};
		hustle.Queue.reserve({
			tube: 'outgoing',
			success: function(item) {
				id	=	item.id;
				finish();
			},
			error: function() {
				error	=	e;
				console.error('err: ', e);
				finish();
			}
		});
	});

	it('can count ready items in a tube', function(done) {
		var count	=	null;
		var error	=	false;
		var finish	=	function()
		{
			expect(error).toBe(false);
			// 10 - 1 reserved item
			expect(count).toBe(9);
			done();
		};
		hustle.Queue.count_ready('outgoing', {
			success: function(num) {
				count	=	num;
				finish();
			},
			error: function(e) {
				error	=	e;
				console.error('err: ', e);
				finish();
			}
		});
	});

	it('gets a null item when none are available', function(done) {
		var item	=	{lol: true};
		var error	=	false;
		var finish	=	function()
		{
			expect(item).toBeNull(null);
			expect(error).toBe(false);
			done();
		};
		hustle.Queue.reserve({
			tube: 'incoming',
			success: function(i) {
				item	=	i;
				finish();
			},
			error: function(e) {
				error	=	e;
				console.error('err: ', e);
				finish();
			}
		});
	});

	it('can bury an item', function(done) {
		var error	=	false;
		var finish	=	function()
		{
			expect(error).toBe(false);
			done();
		};
		hustle.Queue.bury(ids.first, {
			success: function(i) {
				finish();
			},
			error: function(e) {
				error	=	e;
				console.error('err: ', e);
				finish();
			}
		});
	});

	it('can peek queue items', function(done) {
		var num_peeked	=	0;
		var num_items	=	2;
		var errors		=	[];

		var finish		=	function()
		{
			num_peeked++;
			if(num_peeked < num_items) return;
			expect(errors.length).toBe(0);
			done();
		};

		var error	=	function(e)
		{
			errors.push(e);
			console.error('err: ', e);
			finish();
		};

		// first item should be buried
		hustle.Queue.peek(ids.first, {
			success: function(item) {
				expect(item.state).toBe('buried');
				expect(item.buries).toBe(1);
				finish();
			},
			error: error
		});

		// priority item should be reserved
		hustle.Queue.peek(ids.priority, {
			success: function(item) {
				expect(item.state).toBe('reserved');
				expect(item.reserves).toBe(1);
				finish();
			},
			error: error
		});
	});

	it('can kick items', function(done) {
		var errors	=	[];
		var finish	=	function()
		{
			expect(errors.length).toBe(0);
			done();
		};
		hustle.Queue.kick(2, {
			success: function(num) {
				// should return number of jobs kicked
				expect(num).toBe(1);
				finish();
			},
			error: function(e) {
				errors.push(e);
				console.error('err: ', e);
				finish();
			}
		});
	});

	it('can release items', function(done) {
		var errors	=	[];
		var finish	=	function()
		{
			expect(errors.length).toBe(0);
			done();
		};

		hustle.Queue.release(ids.priority, {
			priority: 460,
			success: function() {
				hustle.Queue.peek(ids.priority, {
					success: function(item) {
						expect(item.state).toBe('ready');
						expect(item.tube).toBe('outgoing');
						expect(item.priority).toBe(460);
						finish();
					},
					error: function(e) {
						errors.push(e);
						console.error('err: ', e);
						finish();
					}
				});
			},
			error: function(e) {
				errors.push(e);
				finish();
			}
		});
	});

	it('can delete items', function(done) {
		var errors	=	[];
		var finish	=	function()
		{
			expect(errors.length).toBe(0);
			done();
		};

		hustle.Queue.delete(ids.first, {
			success: function() {
				hustle.Queue.peek(ids.first, {
					success: function(item) {
						expect(item).toBe(null);
						finish();
					},
					error: function(e) {
						errors.push(e);
						console.error('err: ', e);
						finish();
					}
				});
			},
			error: function(e) {
				errors.push(e);
				finish();
			}
		});
	});

	it('gets a null item when deleting items that don\'t exist', function(done) {
		var item	=	{hai: 'lol'};
		var error	=	false;
		var finish	=	function()
		{
			expect(item).toBe(null);
			expect(error).toBe(false);
			done();
		};
		hustle.Queue.delete(6980085, {
			success: function(ditem) {
				item	=	ditem;
				finish();
			},
			error: function(e) {
				error	=	e;
				console.error('err: ', e);
				finish();
			}
		});
	});

	it('can consume a tube', function(done) {
		var num_consumed	=	0;
		var num_items		=	3;
		var errors			=	[];
		var consumer		=	null;
		var ids				=	new Array(num_items);
		var finish	=	function()
		{
			num_consumed++;
			if(num_consumed < num_items) return;
			expect(errors.length).toBe(0);
			expect(consumer.stop()).toBe(true);
			expect(consumer.stop()).toBe(false);	// yes, there should be two
			expect(consumer.stop()).toBe(false);
			done();
		};

		var error	=	function(e)
		{
			errors.push(e);
			console.error('err: ', e);
			finish();
		};

		var dispatch	=	function(item)
		{
			expect(ids.indexOf(item.id) >= 0).toBe(true);
			hustle.Queue.delete(item.id, {
				success: finish,
				error: error
			});
		};
		consumer	=	new hustle.Queue.Consumer(dispatch, {
			tube: 'incoming'
		});

		for(var i = 0; i < num_items; i++)
		{
			var id		=	Math.round(Math.random() * 1000);
			var item	=	{id: id, test: 'YOLOOOO'};
			ids.push(id);
			(function(idx) {
				hustle.Queue.put(item, {
					tube: 'incoming',
					priority: idx,
					success: function(item) {
						ids[idx]	=	item.id;
					},
					error: error
				});
			})(i);
		}
	});

	it('can close a database', function(done) {
		var res	=	hustle.close();
		expect(res).toBe(true);
		expect(hustle.is_open()).toBe(false);
		done();
	});
});

describe('Hustle pubsub operations', function() {
	var hustle	=	new Hustle();

	beforeEach(function(done) {
		setTimeout(function() {
			done();
		}, 1000);
	});

	it('can open a database (again)', function(done) {
		var db	=	null;
		var finished	=	function()
		{
			expect(db instanceof IDBDatabase).toBe(true);
			expect(hustle.is_open()).toBe(true);
			done();
		};
		hustle.open({
			success: function(e) {
				db	=	e.target.result;
				finished();
			},
			error: function(e) {
				console.error('err: ', e);
				finished();
			}
		});
	});

	it('can use multiple subscribers and get each message only once each', function(done) {
		var errors			=	[];
		var num_messages	=	3;
		var sent_messages	=	[];
		var got_messages	=	0;
		var seen_messages	=	{};

		var sub1;
		var sub2;

		var finish			=	function()
		{
			got_messages++;
			if(got_messages < num_messages * 2) return;

			expect(errors.length).toBe(0);
			expect(sent_messages.length).toBe(4);
			expect(got_messages).toBe(6);
			expect(Object.keys(seen_messages).length).toBe(3);
			sub1.stop();
			sub2.stop();
			done();
		};

		var dispatch		=	function(msg)
		{
			if(!seen_messages[msg.id]) seen_messages[msg.id] = 0;
			seen_messages[msg.id]++;
			finish();
		};

		var opts	=	{
			error: function(e) {
				errors.push(e);
				console.error('err: ', e);
				finish();
			}
		};

		sub1	=	new hustle.Pubsub.Subscriber('herp', dispatch, {});
		sub2	=	new hustle.Pubsub.Subscriber('herp', dispatch, {});

		var opts	=	{
			success: function(msg) {
				sent_messages.push(msg.id);
			},
			error: function(e) {
				errors.push(e);
				console.error('err: ', e);
			}
		};
		hustle.Pubsub.publish('void', 'and when they opened up her purse, they found a snail inside', opts);
		hustle.Pubsub.publish('herp', 'stop that bending', opts);
		hustle.Pubsub.publish('herp', 'your dog will love it', opts);
		hustle.Pubsub.publish('herp', 'impress the ladies', opts);
	});

	it('will order messages properly', function(done) {
		var num_messages	=	10;
		var got_messages	=	0;
		var errors			=	[];
		var div				=	10;
		var finalval		=	div;
		var sub				=	null;

		// calculate a value that will only happen in the given order
		for(var i = 0; i < num_messages; i++)
		{
			finalval	=	Math.log(finalval) + (i + 1);
		}

		var finish	=	function()
		{
			got_messages++;
			if(got_messages < num_messages) return;
			expect(errors.length).toBe(0);
			expect(div).toBe(finalval);
			sub.stop();
			done();
		};

		var opts	=	{
			error: function(e) {
				errors.push(e);
				console.error('err: ', e);
				finish();
			}
		};

		sub	=	new hustle.Pubsub.Subscriber('order', function(msg) {
			div	=	Math.log(div) + (msg.data.val + 1);
			finish();
		}, opts);
		sub.stop();

		var sent		=	0;
		var do_start	=	function()
		{
			sent++;
			if(sent < num_messages) return false;
			sub.start();
		};

		for(var i = 0; i < num_messages; i++)
		{
			(function(val) {
				hustle.Pubsub.publish('order', {val: val}, {
					success: function(msg) {
						do_start();
					},
					error: function(e) {
						console.error('err: ', e);
					}
				});
			})(i);
		}
	});

	it('can close a database', function(done) {
		var res	=	hustle.close();
		expect(res).toBe(true);
		expect(hustle.is_open()).toBe(false);
		done();
	});
});

describe('Hustle promise API (subset)', function() {
	var hustle	=	new Hustle({
		tubes: ['incoming', 'outgoing'],
	});
	hustle.promisify();

	beforeEach(function(done) {
		setTimeout(function() {
			done();
		}, 1000);
	});

	it('can clear a database', function(done) {
		var res	=	hustle.wipe();
		expect(res).toBe(true);
		done();
	});

	it('can open a database', function(done) {
		var db	=	null;
		var finished	=	function()
		{
			expect(db instanceof IDBDatabase).toBe(true);
			expect(hustle.is_open()).toBe(true);
			done();
		};
		hustle.open().then(function(e) {
			db	=	e.target.result;
			finished();
		}).catch(function(e) {
			console.error('err: ', e);
			finished();
		});
	});

	it('can add queue items', function(done) {
		var errors			=	[];
		var items			=	[];
		var num_messages	=	2;
		var num_finished	=	0;

		var finish	=	function()
		{
			num_finished++;
			if(num_finished < num_messages) return;
			expect(items[0]).toBe('get this?');
			expect(items[1]).toBe('oh hai.');
			done();
		};

		var success	=	function(item)
		{
			items.push(item.data);
			finish();
		};
		var error	=	function(e)
		{
			errors.push(e);
			console.error('err: ', e);
			finish();
		};
		hustle.Queue.put('get this?', {tube: 'outgoing'}).then(success).catch(error);
		hustle.Queue.put('oh hai.', {tube: 'outgoing'}).then(success).catch(error);
	});

	it('can count ready items in a tube', function(done) {
		var error	=	null;
		var number	=	0;
		var finish	=	function()
		{
			expect(number).toBe(2);
			expect(error).toBe(null);
			done();
		};
		hustle.Queue.count_ready('outgoing').then(function(num) {
			number	=	num;
			finish();
		}).catch(function(e) {
			error	=	e;
			finish();
		})
	});

	it('can reserve (and delete) queue items', function(done) {
		var errors			=	[];
		var items			=	[];
		var num_messages	=	2;
		var num_finished	=	0;

		var finish	=	function()
		{
			num_finished++;
			if(num_finished < num_messages) return;
			expect(items[0]).toBe('get this?');
			expect(items[1]).toBe('oh hai.');
			done();
		};

		var error	=	function(e)
		{
			errors.push(e);
			console.error('err: ', e);
			finish();
		};
		var dsuccess	=	function()
		{
			finish();
		};

		var success	=	function(item)
		{
			items.push(item.data);
			hustle.Queue.delete(item.id).then(dsuccess).catch(error);
		};
		hustle.Queue.reserve({tube: 'outgoing'}).then(success).catch(error);
		hustle.Queue.reserve({tube: 'outgoing'}).then(success).catch(error);
	});

	it('can publish/subscribe', function(done) {
		var message	=	null;
		var send	=	'you\'re loitering too, man. that\'s right you\'re loitering too.';
		var error	=	null;
		var sub		=	null;
		var finish	=	function()
		{
			expect(message).toBe(send);
			expect(error).toBe(null);
			expect(sub.stop()).toBe(true);
			done();
		};

		sub	=	new hustle.Pubsub.Subscriber('gabbagabbahey', function(msg) {
			message	=	msg.data;
			finish();
		}, {error: function(e) { error = e; finish(); }});

		hustle.Pubsub.publish('gabbagabbahey', send).then(function(msg) {
		}).catch(function(e) {
			error	=	e;
		});

	});

	it('can close a database', function(done) {
		var res	=	hustle.close();
		expect(res).toBe(true);
		expect(hustle.is_open()).toBe(false);
		done();
	});
});

