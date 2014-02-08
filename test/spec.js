describe('Hustle', function() {
	var queue	=	new Hustle();

	it('has known exported functions', function() {
		var exports	=	['open', 'close', 'is_open', 'peek', 'put', 'reserve', 'delete', 'release', 'bury', 'kick', 'kick_job', 'count_ready', 'consume', 'wipe'];
		for(var i = 0; i < exports.length; i++)
		{
			expect(typeof queue[exports[i]]).toBe('function');
		}
	});

	it('is awesome', function() {
		expect(true).toBe(true);
	});
});

describe('Hustle operations', function() {
	var queue	=	new Hustle({
		tubes: ['incoming', 'outgoing'],
	});
	var timeout	=	false;

	// stores some of the ids of our queue items
	var ids	=	{
		first: null,
		priority: null
	};

	beforeEach(function(done) {
		setTimeout(function() {
			timeout	=	true;
			done();
		}, 1000);
	});

	it('can clear a queue database', function(done) {
		var res	=	queue.wipe();
		expect(res).toBe(true);
		done();
	});

	it('can open a queue database', function(done) {
		var db	=	null;
		var finished	=	function()
		{
			expect(db instanceof IDBDatabase).toBe(true);
			expect(queue.is_open()).toBe(true);
			done();
		};
		queue.open({
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
			queue.put(data, {
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
		queue.reserve({
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
		queue.count_ready('outgoing', {
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
		queue.reserve({
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
		queue.bury(ids.first, {
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
		queue.peek(ids.first, {
			success: function(item) {
				expect(item.state).toBe('buried');
				expect(item.buries).toBe(1);
				finish();
			},
			error: error
		});

		// priority item should be reserved
		queue.peek(ids.priority, {
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
		queue.kick(2, {
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

		queue.release(ids.priority, {
			priority: 460,
			success: function() {
				queue.peek(ids.priority, {
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

		queue.delete(ids.first, {
			success: function() {
				queue.peek(ids.first, {
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
		queue.delete(6980085, {
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
		var stop			=	null;
		var ids				=	new Array(num_items);
		var finish	=	function()
		{
			num_consumed++;
			if(num_consumed < num_items) return;
			expect(errors.length).toBe(0);
			expect(stop()).toBe(true);
			expect(stop()).toBe(false);		// yes, there should be two
			expect(stop()).toBe(false);
			done();
		};

		var error	=	function(e)
		{
			errors.push(e);
			console.error('err: ', e);
			finish();
		};

		stop	=	queue.consume('incoming', function(item) {
			expect(ids.indexOf(item.id) >= 0).toBe(true);
			queue.delete(item.id, {
				success: finish,
				error: error
			});
		});

		for(var i = 0; i < num_items; i++)
		{
			var id		=	Math.round(Math.random() * 1000);
			var item	=	{id: id, test: 'YOLOOOO'};
			ids.push(id);
			(function(idx) {
				queue.put(item, {
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
		var res	=	queue.close();
		expect(res).toBe(true);
		expect(queue.is_open()).toBe(false);
		done();
	});
});

