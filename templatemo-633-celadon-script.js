/*
  Celadon Template
  https://templatemo.com/tm-633-celadon
*/

(function() {
    "use strict";
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- sound engine ---------- */
    /* an AudioContext only starts on a real activation, so the control shows a pending
       state and an honest cue until resume() actually reports running */
    var Sound = (function() {
        var ctx = null,
            comp = null,
            master = null,
            clip = null,
            noiseBuf = null;
        var enabled = true,
            armed = false;
        /* LEVEL multiplies every voice before the compressor, one number to retune loudness */
        var LEVEL = 2.6;
        var btn = document.getElementById("sbtn");
        var cue = document.getElementById("scue");

        function paint() {
            if (!btn) return;
            btn.classList.toggle("off", !enabled);
            btn.classList.toggle("armed", enabled && armed);
            btn.setAttribute("aria-pressed", enabled ? "true" : "false");
            var name = !enabled ? "Sound off" : (armed ? "Sound on" : "Sound on, click anywhere to start it");
            btn.setAttribute("aria-label", name);
            btn.setAttribute("title", name);
            if (cue) cue.classList.toggle("gone", armed || !enabled);
        }

        function build() {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            try {
                ctx = new AC();
            } catch (e) {
                return false;
            }
            comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -14;
            comp.ratio.value = 4;
            comp.knee.value = 14;
            comp.attack.value = 0.005;
            comp.release.value = 0.22;
            /* tanh soft clip so the hot signal rounds off instead of cracking at 0 dBFS */
            clip = ctx.createWaveShaper();
            var curve = new Float32Array(1024);
            for (var k = 0; k < 1024; k++) {
                var v = (k / 1023) * 2 - 1;
                curve[k] = Math.tanh(v * 1.6) / Math.tanh(1.6);
            }
            clip.curve = curve;
            clip.oversample = "2x";
            master = ctx.createGain();
            master.gain.value = 1.35;
            comp.connect(clip);
            clip.connect(master);
            master.connect(ctx.destination);
            var len = Math.floor(ctx.sampleRate * 0.4);
            noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
            var d = noiseBuf.getChannelData(0);
            for (var i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * (1 - i / len);
            }
            return true;
        }

        function ready() {
            return enabled && armed && ctx && ctx.state === "running";
        }

        function tone(o) {
            if (!ready()) return;
            var t = ctx.currentTime + (o.at || 0);
            var osc = ctx.createOscillator(),
                g = ctx.createGain();
            osc.type = o.type || "sine";
            osc.frequency.setValueAtTime(o.f, t);
            if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.d);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(o.g * LEVEL, t + (o.rise || 0.012));
            g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
            osc.connect(g);
            g.connect(comp);
            osc.start(t);
            osc.stop(t + o.d + 0.03);
        }

        function body(o) {
            if (!ready()) return;
            var t = ctx.currentTime + (o.at || 0);
            var src = ctx.createBufferSource(),
                f = ctx.createBiquadFilter(),
                g = ctx.createGain();
            src.buffer = noiseBuf;
            f.type = o.band ? "bandpass" : "lowpass";
            if (o.band) f.Q.value = o.q || 1.4;
            f.frequency.setValueAtTime(o.cut, t);
            f.frequency.exponentialRampToValueAtTime(Math.max(60, o.cut2 || o.cut * 0.35), t + o.d);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(o.g * LEVEL, t + (o.rise || 0.008));
            g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
            src.connect(f);
            f.connect(g);
            g.connect(comp);
            src.start(t);
            src.stop(t + o.d + 0.03);
        }

        /* small random detune so repeated hovers do not sound like a machine */
        function jit(f) {
            return f * (1 + (Math.random() - 0.5) * 0.03);
        }

        /* pad: one oscillator driven by point lists, so a sound can bend and swell
           along its whole length with no second attack anywhere in it */
        function pad(o) {
            if (!ready()) return;
            var t = ctx.currentTime + (o.at || 0);
            var osc = ctx.createOscillator(),
                g = ctx.createGain();
            osc.type = o.type || "sine";
            osc.frequency.setValueAtTime(o.f[0][1], t);
            for (var i = 1; i < o.f.length; i++) osc.frequency.exponentialRampToValueAtTime(o.f[i][1], t + o.f[i][0]);
            g.gain.setValueAtTime(0.0001, t);
            for (var j = 0; j < o.g.length; j++) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.g[j][1] * LEVEL), t + o.g[j][0]);
            var end = o.g[o.g.length - 1][0];
            osc.connect(g);
            g.connect(comp);
            osc.start(t);
            osc.stop(t + end + 0.05);
        }

        /* voices are kept low and round: sines below 1.2kHz, short soft noise for touch,
           gentle low-Q sweeps for anything that slides, no bright partials */
        var voices = {
            /* hover: a rounded breath rather than a tap, 18ms rise so there is no snap, no noise,
               D5 settling a shade flat with an octave below for warmth, both at a whisper */
            tick: function() {
                var f = jit(587);
                pad({
                    f: [
                        [0, f],
                        [.12, f * 0.96]
                    ],
                    g: [
                        [.018, .03],
                        [.06, .024],
                        [.16, .0001]
                    ]
                });
                pad({
                    f: [
                        [0, f * 0.5],
                        [.12, f * 0.48]
                    ],
                    g: [
                        [.02, .018],
                        [.18, .0001]
                    ]
                });
            },
            press: function() {
                tone({
                    type: "sine",
                    f: 520,
                    f2: 390,
                    d: .13,
                    g: .14
                });
                body({
                    cut: 900,
                    d: .05,
                    g: .05
                });
            },
            detent: function() {
                tone({
                    type: "sine",
                    f: 600,
                    f2: 490,
                    d: .1,
                    g: .11
                });
            },
            /* rail: a short breath that bends a whole tone in the direction the cards are moving,
               A4 up to B4 going forward, B4 down to A4 going back, same envelope family as the slab */
            glide: function(dir) {
                var up = dir >= 0;
                pad({
                    f: [
                        [0, up ? 440 : 494],
                        [.14, up ? 494 : 440]
                    ],
                    g: [
                        [.035, .032],
                        [.11, .026],
                        [.16, .04],
                        [.3, .0001]
                    ]
                });
                pad({
                    f: [
                        [0, up ? 220 : 247],
                        [.14, up ? 247 : 220]
                    ],
                    g: [
                        [.04, .016],
                        [.17, .022],
                        [.32, .0001]
                    ]
                });
            },
            thud: function() {
                body({
                    cut: 260,
                    d: .17,
                    g: .2
                });
                tone({
                    type: "sine",
                    f: 118,
                    f2: 82,
                    d: .2,
                    g: .15
                });
            },
            /* the slab: one breath. E4 eases up a minor third to G4 over the widen, the level
               dips slightly as it travels, then swells once at the arrival and fades. The swell
               is the ending, and it has no attack of its own, so it cannot read as a second sound */
            slab: function() {
                pad({
                    f: [
                        [0, 330],
                        [.32, 392]
                    ],
                    g: [
                        [.09, .045],
                        [.3, .036],
                        [.42, .06],
                        [.72, .0001]
                    ]
                });
                pad({
                    f: [
                        [0, 165],
                        [.32, 196]
                    ],
                    g: [
                        [.1, .024],
                        [.3, .02],
                        [.44, .036],
                        [.78, .0001]
                    ]
                });
            },
            slideOpen: function() {
                pad({
                    f: [
                        [0, 330],
                        [.3, 392]
                    ],
                    g: [
                        [.08, .04],
                        [.28, .032],
                        [.38, .052],
                        [.66, .0001]
                    ]
                });
                pad({
                    f: [
                        [0, 165],
                        [.3, 196]
                    ],
                    g: [
                        [.09, .02],
                        [.4, .03],
                        [.7, .0001]
                    ]
                });
            },
            slideClose: function() {
                pad({
                    f: [
                        [0, 392],
                        [.28, 330]
                    ],
                    g: [
                        [.07, .04],
                        [.26, .032],
                        [.34, .046],
                        [.6, .0001]
                    ]
                });
                pad({
                    f: [
                        [0, 196],
                        [.28, 165]
                    ],
                    g: [
                        [.08, .02],
                        [.36, .028],
                        [.64, .0001]
                    ]
                });
            },
            openq: function() {
                tone({
                    type: "sine",
                    f: 430,
                    f2: 560,
                    d: .15,
                    g: .1
                });
                body({
                    cut: 700,
                    d: .07,
                    g: .04
                });
            },
            closeq: function() {
                tone({
                    type: "sine",
                    f: 560,
                    f2: 430,
                    d: .13,
                    g: .09
                });
                body({
                    cut: 600,
                    d: .06,
                    g: .035
                });
            },
            onSw: function() {
                tone({
                    type: "sine",
                    f: 500,
                    f2: 700,
                    d: .12,
                    g: .12
                });
            },
            offSw: function() {
                tone({
                    type: "sine",
                    f: 700,
                    f2: 500,
                    d: .12,
                    g: .11
                });
            },
            drop: function() {
                body({
                    cut: 240,
                    d: .28,
                    g: .17
                });
                tone({
                    type: "sine",
                    f: 140,
                    f2: 88,
                    d: .24,
                    g: .11
                });
            },
            chime: function() {
                tone({
                    type: "sine",
                    f: 660,
                    d: .32,
                    g: .17
                });
                tone({
                    type: "sine",
                    f: 990,
                    d: .28,
                    g: .09,
                    at: .05
                });
            }
        };

        function play(name, arg) {
            var v = voices[name];
            if (v) v(arg);
        }

        /* arming, capture phase, throttled, unbinds itself once genuinely running */
        var events = ["pointerdown", "pointerup", "click", "keydown", "touchstart", "pointermove", "wheel"];
        var lastTry = 0;

        function arm() {
            var now = Date.now();
            if (now - lastTry < 250) return;
            lastTry = now;
            if (!ctx && !build()) return;
            ctx.resume().then(function() {
                if (ctx.state === "running") {
                    armed = true;
                    paint();
                    for (var i = 0; i < events.length; i++) window.removeEventListener(events[i], arm, true);
                }
            }).catch(function() {});
        }
        for (var e = 0; e < events.length; e++) window.addEventListener(events[e], arm, true);

        if (btn) {
            btn.addEventListener("click", function() {
                enabled = !enabled;
                paint();
                if (enabled) {
                    arm();
                    setTimeout(function() {
                        play("press");
                    }, 60);
                }
            });
        }
        paint();
        return {
            play: play,
            on: function() {
                return ready();
            }
        };
    })();

    /* ---------- header shadow ---------- */
    var top = document.getElementById("top");
    var onScroll = function() {
        top.classList.toggle("stuck", window.scrollY > 12);
    };
    window.addEventListener("scroll", onScroll, {
        passive: true
    });
    onScroll();

    /* ---------- drawer ---------- */
    var burger = document.getElementById("burger");
    var drawer = document.getElementById("drawer");
    var scrim = document.getElementById("scrim");

    function setDrawer(open) {
        var was = drawer.classList.contains("on");
        drawer.classList.toggle("on", open);
        scrim.classList.toggle("on", open);
        document.body.classList.toggle("lock", open);
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        if (open !== was) Sound.play(open ? "drop" : "slideClose");
    }
    burger.addEventListener("click", function() {
        setDrawer(!drawer.classList.contains("on"));
    });
    scrim.addEventListener("click", function() {
        setDrawer(false);
    });
    drawer.addEventListener("click", function(e) {
        if (e.target.closest("a")) setDrawer(false);
    });
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") setDrawer(false);
    });

    /* ---------- reveal with mandatory fallback ---------- */
    var items = document.querySelectorAll(".rv");

    function showAll() {
        for (var i = 0; i < items.length; i++) items[i].classList.add("in");
    }
    if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function(entries) {
            entries.forEach(function(en) {
                if (en.isIntersecting) {
                    en.target.classList.add("in");
                    io.unobserve(en.target);
                }
            });
        }, {
            threshold: 0.14,
            rootMargin: "0px 0px -8% 0px"
        });
        for (var i = 0; i < items.length; i++) io.observe(items[i]);
        setTimeout(showAll, 3000);
    } else {
        showAll();
    }

    /* ---------- back to top, retreats with the hero ---------- */
    var hero = document.querySelector(".hero");
    if ("IntersectionObserver" in window && hero) {
        var ho = new IntersectionObserver(function(en) {
            document.body.classList.toggle("away", en[0].intersectionRatio < 0.5);
        }, {
            threshold: [0, .25, .5, .75, 1]
        });
        ho.observe(hero);
    }
    document.getElementById("up").addEventListener("click", function() {
        window.scrollTo({
            top: 0,
            behavior: reduce ? "auto" : "smooth"
        });
    });

    /* ---------- hero parallax, decorative layers only ---------- */
    var stage = document.querySelector(".stage");
    if (stage && !reduce && window.matchMedia("(min-width:721px)").matches) {
        var layers = stage.querySelectorAll("[data-depth]");
        var tx = 0,
            ty = 0,
            cx = 0,
            cy = 0,
            hRaf = null;
        var pump = function() {
            cx += (tx - cx) * 0.07;
            cy += (ty - cy) * 0.07;
            for (var i = 0; i < layers.length; i++) {
                var d = parseFloat(layers[i].getAttribute("data-depth"));
                if (isNaN(d)) d = 0;
                var base = layers[i].classList.contains("core") ? "translate(-50%,-50%) " : "";
                layers[i].style.transform = base + "translate3d(" + (cx * d).toFixed(2) + "px," + (cy * d).toFixed(2) + "px,0)";
            }
            if (Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02) {
                hRaf = requestAnimationFrame(pump);
            } else {
                hRaf = null;
            }
        };
        window.addEventListener("pointermove", function(e) {
            var r = stage.getBoundingClientRect();
            tx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 2;
            ty = ((e.clientY - (r.top + r.height / 2)) / r.height) * 2;
            if (hRaf === null) hRaf = requestAnimationFrame(pump);
        }, {
            passive: true
        });
    }

    /* ---------- stat counters ---------- */
    var nums = document.querySelectorAll(".stat b");

    function runNum(el) {
        var to = parseFloat(el.getAttribute("data-to"));
        var sfx = el.getAttribute("data-suffix") || "";
        if (isNaN(to)) return;
        if (reduce) {
            el.textContent = to.toLocaleString() + sfx;
            return;
        }
        var t0 = performance.now(),
            dur = 1200;
        var tick = function(now) {
            var p = Math.min(1, (now - t0) / dur);
            var e = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(to * e).toLocaleString() + sfx;
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
    if ("IntersectionObserver" in window) {
        var no = new IntersectionObserver(function(en) {
            en.forEach(function(x) {
                if (x.isIntersecting) {
                    runNum(x.target);
                    no.unobserve(x.target);
                }
            });
        }, {
            threshold: 0.5
        });
        for (var n = 0; n < nums.length; n++) no.observe(nums[n]);
        setTimeout(function() {
            for (var n = 0; n < nums.length; n++) runNum(nums[n]);
        }, 3000);
    } else {
        for (var n2 = 0; n2 < nums.length; n2++) runNum(nums[n2]);
    }

    /* ---------- testimonial rail ---------- */
    var view = document.getElementById("viewport");
    var lane = document.getElementById("lane");
    if (view && lane) {
        var cards = lane.children;
        var x = 0,
            minX = 0,
            vel = 0,
            snap = null,
            raf = null;
        var down = false,
            promoted = false,
            startX = 0,
            startPointer = 0,
            lastP = 0,
            lastT = 0,
            padL = 0;
        var idx = -1,
            blockUntil = 0;
        var prevB = document.getElementById("prev");
        var nextB = document.getElementById("next");
        var count = document.getElementById("count");

        function pad2(n) {
            return (n < 10 ? "0" : "") + n;
        }

        /* each card lags the lane velocity with its own stiffness, so the row
           behaves like a loosely strung chain instead of a rigid strip */
        var lag = [],
            tfCache = [];
        for (var c = 0; c < cards.length; c++) {
            lag.push(0);
            tfCache.push("");
        }

        function physics() {
            if (reduce) return false;
            var moving = false;
            for (var i = 0; i < cards.length; i++) {
                var k = 0.155 - (i % 3) * 0.032;
                lag[i] += (vel - lag[i]) * k;
                if (Math.abs(lag[i]) > 0.03) moving = true;
                else lag[i] = 0;
                var rot = (-lag[i] * 0.115).toFixed(2);
                var dy = (Math.abs(lag[i]) * 0.3).toFixed(2);
                var t = "rotate(" + rot + "deg) translateY(" + dy + "px)";
                if (tfCache[i] !== t) {
                    cards[i].style.transform = t;
                    tfCache[i] = t;
                }
            }
            return moving;
        }

        function measure() {
            padL = parseFloat(getComputedStyle(lane).paddingLeft) || 0;
            minX = Math.min(0, view.clientWidth - lane.scrollWidth);
            if (x < minX) x = minX;
            if (x > 0) x = 0;
            draw();
        }

        function nearest() {
            var best = 0,
                bestD = Infinity;
            for (var i = 0; i < cards.length; i++) {
                var d = Math.abs(cards[i].offsetLeft + x - padL);
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            return best;
        }

        var lastGlide = 0;

        function draw() {
            lane.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
            var i = nearest();
            if (i !== idx) {
                if (idx !== -1) {
                    var now = Date.now();
                    if (now - lastGlide > 110) {
                        Sound.play("glide", i > idx ? 1 : -1);
                        lastGlide = now;
                    }
                }
                idx = i;
                count.textContent = pad2(i + 1) + " / " + pad2(cards.length);
            }
            prevB.disabled = x >= -1;
            nextB.disabled = x <= minX + 1;
        }

        function loop() {
            if (snap !== null) {
                x += (snap - x) * 0.16;
                if (Math.abs(snap - x) < 0.5) {
                    x = snap;
                    snap = null;
                }
            } else if (!down) {
                if (Math.abs(vel) > 0.1) {
                    x += vel;
                    vel *= 0.92;
                    if (x > 0) {
                        x = 0;
                        vel = 0;
                    }
                    if (x < minX) {
                        x = minX;
                        vel = 0;
                    }
                } else {
                    vel = 0;
                }
            }
            draw();
            var springing = physics();
            if (snap !== null || Math.abs(vel) > 0.1 || down || springing) {
                raf = requestAnimationFrame(loop);
            } else {
                raf = null;
            }
        }

        function kick() {
            if (raf === null) raf = requestAnimationFrame(loop);
        }

        function goTo(i) {
            i = Math.max(0, Math.min(cards.length - 1, i));
            snap = Math.max(minX, Math.min(0, -(cards[i].offsetLeft - padL)));
            kick();
        }
        prevB.addEventListener("click", function() {
            goTo(nearest() - 1);
        });
        nextB.addEventListener("click", function() {
            goTo(nearest() + 1);
        });

        view.addEventListener("pointerdown", function(e) {
            down = true;
            promoted = false;
            snap = null;
            vel = 0;
            startX = x;
            startPointer = e.clientX;
            lastP = e.clientX;
            lastT = performance.now();
        });
        view.addEventListener("pointermove", function(e) {
            if (!down) return;
            var travel = e.clientX - startPointer;
            if (!promoted) {
                if (Math.abs(travel) < 8) return;
                promoted = true;
                view.classList.add("dragging");
                try {
                    view.setPointerCapture(e.pointerId);
                } catch (err) {}
            }
            x = startX + travel;
            if (x > 0) x = x * 0.35;
            if (x < minX) x = minX + (x - minX) * 0.35;
            var now = performance.now(),
                dt = now - lastT;
            if (dt > 0) vel = (e.clientX - lastP) / dt * 15;
            lastP = e.clientX;
            lastT = now;
            kick();
        });

        function endDrag() {
            if (!down) return;
            down = false;
            if (promoted) {
                blockUntil = Date.now() + 240;
            }
            promoted = false;
            view.classList.remove("dragging");
            if (x > 0 || x < minX) {
                snap = x > 0 ? 0 : minX;
                vel = 0;
            }
            /* nudge the chain so the cards settle back through zero instead of stopping flat */
            if (!reduce) {
                for (var i = 0; i < lag.length; i++) {
                    lag[i] *= 1.35;
                }
            }
            kick();
        }
        view.addEventListener("pointerup", endDrag);
        view.addEventListener("pointercancel", endDrag);
        view.addEventListener("lostpointercapture", endDrag);
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("blur", endDrag);
        view.addEventListener("dragstart", function(e) {
            e.preventDefault();
        });
        view.addEventListener("wheel", function() {
            snap = null;
        }, {
            passive: true
        });

        window.addEventListener("resize", measure);
        window.addEventListener("load", measure);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(measure);
        }
        measure();
    }

    /* ---------- delegated interface voices ---------- */
    window.addEventListener("click", function(e) {
        if (e.target.closest(".sbtn")) return;
        if (e.target.closest("#create")) Sound.play("chime");
        else if (e.target.closest(".btn")) Sound.play("press");
        else if (e.target.closest(".chip")) Sound.play("tick");
    }, true);
    var lastHover = 0,
        lastEl = null;
    var hoverSel = ".nav a, .drawer a, .chip, .btn, .arw, .stave:not(.open), .q, .switch, .footbar a, .up, .sbtn, .brand";
    window.addEventListener("pointerover", function(e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        var el = e.target.closest(hoverSel);
        if (!el || el === lastEl) return;
        lastEl = el;
        var now = Date.now();
        if (now - lastHover < 70) return;
        lastHover = now;
        Sound.play("tick");
    }, true);
    window.addEventListener("pointerout", function(e) {
        if (lastEl && !lastEl.contains(e.relatedTarget)) lastEl = null;
    }, true);

    /* ---------- features slab, click only ---------- */
    var slabrow = document.getElementById("slabrow");
    if (slabrow) {
        var staves = slabrow.querySelectorAll(".stave");

        function openStave(el) {
            if (el.classList.contains("open")) return;
            Sound.play("slab");
            for (var i = 0; i < staves.length; i++) {
                var on = staves[i] === el;
                staves[i].classList.toggle("open", on);
                staves[i].setAttribute("aria-expanded", on ? "true" : "false");
            }
        }
        for (var s = 0; s < staves.length; s++) {
            (function(el) {
                el.addEventListener("click", function() {
                    openStave(el);
                });
                el.addEventListener("keydown", function(e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openStave(el);
                        return;
                    }
                    var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0);
                    if (dir) {
                        e.preventDefault();
                        var here = Array.prototype.indexOf.call(staves, el);
                        var to = staves[Math.max(0, Math.min(staves.length - 1, here + dir))];
                        openStave(to);
                        to.focus();
                    }
                });
            })(staves[s]);
        }
    }

    /* ---------- pricing toggle ---------- */
    var sw = document.getElementById("switch");
    if (sw) {
        var prices = document.querySelectorAll(".price");
        var pers = document.querySelectorAll(".per");
        var totals = document.querySelectorAll(".plan .total");
        var plansEl = document.querySelector(".plans");
        var lblM = document.getElementById("lblM"),
            lblY = document.getElementById("lblY");

        function money(n) {
            return "$" + Number(n).toLocaleString();
        }

        function setYear(yearly) {
            Sound.play(yearly ? "onSw" : "offSw");
            sw.setAttribute("aria-checked", yearly ? "true" : "false");
            sw.setAttribute("aria-label", yearly ? "Switch to monthly billing" : "Switch to yearly billing");
            lblM.classList.toggle("on", !yearly);
            lblY.classList.toggle("on", yearly);
            if (plansEl) plansEl.classList.toggle("yearly", yearly);
            for (var i = 0; i < prices.length; i++) {
                prices[i].textContent = money(prices[i].getAttribute(yearly ? "data-y" : "data-m"));
            }
            for (var j = 0; j < pers.length; j++) {
                pers[j].textContent = yearly ? "per month, billed yearly" : "per month";
            }
            for (var k = 0; k < totals.length; k++) {
                var t = totals[k];
                if (yearly) {
                    var full = parseFloat(t.getAttribute("data-m")) * 12;
                    t.innerHTML = "<b>" + money(t.getAttribute("data-y")) + "</b> a year <span class=\"was\">" + money(full) + "</span>";
                } else {
                    t.textContent = "Billed monthly";
                }
            }
        }
        sw.addEventListener("click", function() {
            setYear(sw.getAttribute("aria-checked") !== "true");
        });
        sw.addEventListener("keydown", function(e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setYear(sw.getAttribute("aria-checked") !== "true");
            }
        });
    }

    /* ---------- faq, click only ---------- */
    var qs = document.querySelectorAll(".q");

    function toggleQ(q) {
        var open = q.classList.toggle("open");
        q.setAttribute("aria-expanded", open ? "true" : "false");
        Sound.play(open ? "openq" : "closeq");
    }
    for (var q = 0; q < qs.length; q++) {
        (function(el) {
            el.addEventListener("click", function() {
                toggleQ(el);
            });
            el.addEventListener("keydown", function(e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleQ(el);
                }
            });
        })(qs[q]);
    }
})();
