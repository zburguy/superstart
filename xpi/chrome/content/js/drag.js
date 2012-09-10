// dragging
var gDrag = (function() {

const Cc = Components.classes;
const Ci = Components.interfaces;
var ssObj = Cc['@enjoyfreeware.org/superstart;1'];
var cfg = ssObj.getService(Ci.ssIConfig);
var sm = ssObj.getService(Ci.ssISiteManager);
ssObj = undefined;

const HOVER = 500;

var elem = null;
var dragIdxes = null;

var timeoutId = null;

var mover = (function() {
	var oft = {x: 0, y: 0};
	var _x = 0;
	var _y = 0;
	function _init(se, x, y) {
		var of = $.offset(elem.parentNode);
		oft.x = x - (of.left + (se.style.left.replace(/px/g, '') - 0) - window.scrollX);
		oft.y = y - (of.top + (se.style.top.replace(/px/g, '') - 0) - window.scrollY);
	}

	function _onMove(el, x, y) {
		_x = x;
		_y = y;
		var w = el.offsetWidth;
		var h = el.offsetHeight;
		var base = $.offset(el.parentNode);
	
		el.style.left = x - oft.x - base.left + window.scrollX + 'px';
		el.style.top = y - oft.y - base.top + window.scrollY + 'px';
	}

	function _refresh(el) {
		_onMove(el, _x, _y);
	}

	return {
		init: _init,
		onMove: _onMove,
		refresh: _refresh
	};
})();

const DO_NONE = 0;
const DO_MOVE = 1;
const DO_MOVE_IN = 2;
const DO_MOVE_OUT = 3;
const DO_OPEN_FOLDER = 4;
function DragOperator(type, p1, p2, p3) {
	this.type = type === undefined ? DO_NONE : type;
	this.p1 = p1;
	this.p2 = p2;
	this.p3 = p3;
}
DragOperator.prototype.isEqual = function(rhs) {
	if (this.type != rhs.type) {
		return false;
	}
	switch (this.type) {
	case DO_MOVE:
		return this.p1 == rhs.p1 && this.p2 == rhs.p2 && this.p3 == rhs.p3;
	case DO_MOVE_IN:
	case DO_MOVE_OUT:
		return this.p1 == rhs.p1 && this.p2 == rhs.p2;
	case DO_OPEN_FOLDER:
		return this.p1 == rhs.p1;
	}
	return false;
}
DragOperator.prototype.act = function() {
	switch (this.type) {
	case DO_MOVE:
		sm.simpleMove(this.p1, this.p2, this.p3);
		dragIdxes[1] = this.p3;
		break;
	case DO_MOVE_IN:
		var from = this.p1, to = this.p2;
		layout.lock();
		var target = sm.getSite(-1, to);
		sm.moveIn(from, to);
		dragIdxes[0] = from < to ? to - 1 : to;
		dragIdxes[1] = target.sites === undefined ? 1 : target.sites.length;
		mover.refresh(elem);
		break;
	case DO_MOVE_OUT:
		var g = this.p1, i = this.p2;
		sm.moveOut(g, i);
		dragIdxes[0] = -1;
		dragIdxes[1] = sm.getTopSiteCount() - 1;
		mover.refresh(elem);
		layout.unlock();
		break;
	case DO_OPEN_FOLDER:
		gDrag.openFolder(this.p1);
		window.setTimeout(function() {
			var fa = $$('folder');
			elem.parentNode.removeChild(elem);
			fa.appendChild(elem);
			mover.refresh(elem);
		}, 0);
		break;
	default:
		log('Begin to do the action: ' + this.type);
		break;
	}
}
DragOperator.prototype.dump = function() {
	log('type: ' + this.type + ' p1, p2, p3: ' + this.p1 + ', ' + this.p2 + ', ' + this.p3);
}

var currOpt = new DragOperator();

function init() {
	elem = null;
	dragIdxes = null;
	clrTimeout();
}

function clrTimeout() {
	if (timeoutId != null) {
		clearTimeout(timeoutId);
		timeoutId = null;
	}
}

function getMoveOpt(x, y, parentArea, lines, inFolder) {
	var l = 0;
	for (var i = 1; i < lines.length; ++ i, ++ l) {
		if (lines[i] > y) {
			break;
		}
	}
	var col = cfg.getConfig('col');
	if (inFolder) { // folder is opened
		col = layout.getFolderCol(col);
	}

	var ses = $(parentArea, '.site');
	var b = l * col;
	var e = b + col;
	if (e > ses.length) {
		e = ses.length;
	}
	for (var i = b; i < e; ++ i) {
		var se = ses[i];
		if ($.hasClass(se, 'dragging')) { // skip myself
			continue;
		}

		if (!inFolder && !$.hasClass(elem, 'folder') && $.inElem(x, y, se)) {
			return new DragOperator(DO_MOVE_IN, dragIdxes[1], i);
		}

		var pos = $.offset(se);
		if (pos.left > x) {
			break;
		}
	}

	var from = dragIdxes[1];
	var to = i;
	if (from < to) {
		-- to;
	}
	if (from == to) {
		return new DragOperator();
	}

	return new DragOperator(DO_MOVE, dragIdxes[0], from, to);
}

function getOpt(x, y) {
	var sites = $$('sites');
	var fa = $$('folder');
	if (dragIdxes[0] != -1) {
		var p = gDrag.at(-1, dragIdxes[0]);
		if ($.inElem(x, y, p) && fa == null) {
			return new DragOperator(DO_OPEN_FOLDER, dragIdxes[0]);
		}

		if (fa == null) {
			if ($.inElem(x, y, p)) {
				return new DragOperator(DO_OPEN_FOLDER, dragIdxes[0]);
			} else {
				return new DragOperator(DO_MOVE_OUT, dragIdxes[0], dragIdxes[1]);
			}
		} else {
			if ($.inElem(x, y, p)) {
				return new DragOperator();
			} else if ($.inElem(x, y, fa)) {
				var p = fa;
				var lines = fa.lines;
				var container = $$('container');
				if (container.style.top) {
					var t = container.style.top.replace(/px/g, '') - 0;
					y -= t;
				}
				return getMoveOpt(x, y, p, lines, true);
			} else {
				return new DragOperator(DO_MOVE_OUT, dragIdxes[0], dragIdxes[1]);
			}
		}
	}

	var p = sites;
	var lines = sites.lines;
	return getMoveOpt(x, y, p, lines, false);
}


return {
	onStart: function(evt) {
		init();
	
		var se = gDrag.elemFromNode(evt.target);
		if (!se || $.hasClass(se, 'opened') || !$.hasClass(se, 'site')) {
			evt.preventDefault();
			return false;
		}
	
		var idxes = gDrag.indexFromNode(se);
		var s = idxes != null ? sm.getSite(idxes[0], idxes[1]) : null;
		if (s != null) {
			elem = se;
			$.addClass(se, 'dragging');
	
			var dt = evt.dataTransfer;
			dt.setData("text/uri-list", s.url);
			dt.setData("text/plain", s.url);
			dt.effectAllowed = 'move';
			var img = document.createElement('div');
			$.addClass(img, 'drag-elem');
			dt.setDragImage(img, 0, 0);
	
			mover.init(se, evt.clientX, evt.clientY);

			dragIdxes = idxes;
		}
	},
	
	onEnter: function(evt) {
		if (elem) {
			evt.preventDefault();
			return false;
		}
	},
	
	onLeave: function(evt) {
		if (elem) {
			evt.preventDefault();
			return false;
		}
	},
	
	onOver: function(evt) {
		if (elem) {
			evt.preventDefault();
			evt.dataTransfer.dropEffect = "move";
	
			var x = evt.clientX;
			var y = evt.clientY;
			mover.onMove(elem, x, y);
			if (layout.inTransition()) {
				return false;
			}

			var newOpt = getOpt(evt.clientX + window.scrollX, evt.clientY + window.scrollY);
			if (!newOpt.isEqual(currOpt)) {
				clrTimeout(timeoutId);
				currOpt = newOpt;
				if (currOpt.type != DO_NONE) {
					timeoutId = window.setTimeout(function() {
						timeoutId = null;
						currOpt.act();
						currOpt = new DragOperator();
					}, HOVER);
				}
			}
	
			return false;
		}
	},
	
	onDrop: function(evt) {
		if (elem) {
			evt.preventDefault();
			return false;
		}
	},
	
	onEnd: function(evt) {
		if (elem) {
			clrTimeout(timeoutId);
	
			$.removeClass(elem, 'dragging');
			if (dragIdxes[0] != -1) {
				if ($.hasClass(elem.parentNode, 'site')) {
					elem.parentNode.removeChild(elem);
					var fa = $$('folder');
					if (fa) {
						fa.appendChild(elem);
					}
				}
			}
			elem = null;
	
			layout.unlock();
			layout.begin();
		}
	}
};
})();
