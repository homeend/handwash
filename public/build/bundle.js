var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src\ProgressBar.svelte generated by Svelte v3.31.2 */

    function create_fragment(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let span;
    	let t;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			span = element("span");
    			t = text(/*percent*/ ctx[0]);
    			attr(span, "class", "sr-only");
    			attr(div0, "class", "progress-bar svelte-nthaca");
    			set_style(div0, "width", /*percent*/ ctx[0] + "%");
    			attr(div1, "class", "progress-container svelte-nthaca");
    			attr(div1, "bp", "offset-5@md 4@md 12@sm");
    			attr(div2, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    			append(div0, span);
    			append(span, t);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*percent*/ 1) set_data(t, /*percent*/ ctx[0]);

    			if (dirty & /*percent*/ 1) {
    				set_style(div0, "width", /*percent*/ ctx[0] + "%");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let percent;
    	let { progress } = $$props;
    	let { total = 20 } = $$props;
    	if (progress < 0) progress = 0;
    	if (progress >= total) progress = total;

    	$$self.$$set = $$props => {
    		if ("progress" in $$props) $$invalidate(1, progress = $$props.progress);
    		if ("total" in $$props) $$invalidate(2, total = $$props.total);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*progress, total*/ 6) {
    			 $$invalidate(0, percent = progress / total * 100);
    		}
    	};

    	return [percent, progress, total];
    }

    class ProgressBar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { progress: 1, total: 2 });
    	}
    }

    /* src\Timer.svelte generated by Svelte v3.31.2 */

    function create_fragment$1(ctx) {
    	let div0;
    	let h2;
    	let t0;
    	let t1_value = total_time - /*counter*/ ctx[1] + "";
    	let t1;
    	let t2;
    	let progressbar;
    	let t3;
    	let div1;
    	let button;
    	let t4;
    	let current;
    	let mounted;
    	let dispose;

    	progressbar = new ProgressBar({
    			props: {
    				progress: /*counter*/ ctx[1],
    				total: total_time
    			}
    		});

    	return {
    		c() {
    			div0 = element("div");
    			h2 = element("h2");
    			t0 = text("Seconds Left: ");
    			t1 = text(t1_value);
    			t2 = space();
    			create_component(progressbar.$$.fragment);
    			t3 = space();
    			div1 = element("div");
    			button = element("button");
    			t4 = text("Start");
    			attr(h2, "bp", "offset-5@md 4@md 12@sm");
    			attr(h2, "class", "svelte-1legwsr");
    			attr(div0, "bp", "grid");
    			button.disabled = /*in_progress*/ ctx[0];
    			attr(button, "bp", "offset-5@md 4@md 12@sm");
    			attr(button, "class", "start svelte-1legwsr");
    			attr(div1, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, h2);
    			append(h2, t0);
    			append(h2, t1);
    			insert(target, t2, anchor);
    			mount_component(progressbar, target, anchor);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			append(div1, button);
    			append(button, t4);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*startTimer*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if ((!current || dirty & /*counter*/ 2) && t1_value !== (t1_value = total_time - /*counter*/ ctx[1] + "")) set_data(t1, t1_value);
    			const progressbar_changes = {};
    			if (dirty & /*counter*/ 2) progressbar_changes.progress = /*counter*/ ctx[1];
    			progressbar.$set(progressbar_changes);

    			if (!current || dirty & /*in_progress*/ 1) {
    				button.disabled = /*in_progress*/ ctx[0];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(progressbar.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(progressbar.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t2);
    			destroy_component(progressbar, detaching);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    const total_time = 20;

    function instance$1($$self, $$props, $$invalidate) {
    	const dispatcher = createEventDispatcher();
    	let in_progress = false;
    	let counter = 0;

    	function startTimer() {
    		if (in_progress) return;
    		$$invalidate(0, in_progress = true);

    		const interval_id = setInterval(
    			() => {
    				$$invalidate(1, counter++, counter);

    				if (counter > total_time) {
    					clearInterval(interval_id);
    					$$invalidate(0, in_progress = false);
    					$$invalidate(1, counter = 0);
    					dispatcher("timer_finished", { msg: "time has run out...." });
    				}
    			},
    			1000
    		);
    	}

    	return [in_progress, counter, startTimer];
    }

    class Timer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src\HowTo.svelte generated by Svelte v3.31.2 */

    function create_fragment$2(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<img src="handwash.gif" bp="offset-5@md 4@md 12@sm" alt="How to wash your hands" class="svelte-wwxt9"/>`;
    			attr(div, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    class HowTo extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src\App.svelte generated by Svelte v3.31.2 */

    function create_fragment$3(ctx) {
    	let h1;
    	let t1;
    	let timer;
    	let t2;
    	let howto;
    	let t3;
    	let h3;
    	let t7;
    	let audio_1;
    	let current;
    	timer = new Timer({});
    	timer.$on("timer_finished", /*timer_finished*/ ctx[1]);
    	howto = new HowTo({});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Handwashing App";
    			t1 = space();
    			create_component(timer.$$.fragment);
    			t2 = space();
    			create_component(howto.$$.fragment);
    			t3 = space();
    			h3 = element("h3");

    			h3.innerHTML = `<a target="_blank" href="http://awareness.who.int/gpsc/clean_hands_protection/en/">Picture Source</a> 
	<a target="_blank" href="https://freesound.org/people/metrostock99/sounds/345086/">Sound Source</a>`;

    			t7 = space();
    			audio_1 = element("audio");
    			audio_1.innerHTML = `<source src="sound.wav"/>`;
    			attr(h1, "class", "svelte-17lkxg");
    			attr(h3, "class", "svelte-17lkxg");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			mount_component(timer, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(howto, target, anchor);
    			insert(target, t3, anchor);
    			insert(target, h3, anchor);
    			insert(target, t7, anchor);
    			insert(target, audio_1, anchor);
    			/*audio_1_binding*/ ctx[2](audio_1);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(timer.$$.fragment, local);
    			transition_in(howto.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(timer.$$.fragment, local);
    			transition_out(howto.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			destroy_component(timer, detaching);
    			if (detaching) detach(t2);
    			destroy_component(howto, detaching);
    			if (detaching) detach(t3);
    			if (detaching) detach(h3);
    			if (detaching) detach(t7);
    			if (detaching) detach(audio_1);
    			/*audio_1_binding*/ ctx[2](null);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let audio;

    	function timer_finished(e) {
    		audio.play();
    	}

    	function audio_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			audio = $$value;
    			$$invalidate(0, audio);
    		});
    	}

    	return [audio, timer_finished, audio_1_binding];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
