/* global SpatialNavigator */

window.SmartScrollbox = (function(exports) {
  'use strict';

  var proto = Object.create(HTMLElement.prototype);

  proto.createdCallback = function ssb_createdCallback() {

    this._template = template.content.cloneNode(true);

    this.listElem = this._template.getElementById('scrollbox-list');
    this.createShadowRoot().appendChild(this._template);

    // left and right margin of the scroll list
    this.margin = 10 * parseInt(this.getAttribute('margin'), 10) || 0;

    this.viewWidth = this.clientWidth - 2 * this.margin;

    this.translateX = 0;

    // Current active node
    this.currentNode = null;

    // add navigable elements to spacial navigator
    var navigableElems = Array.prototype.slice.call(
                                  this.getElementsByClassName('navigable'));
    if (navigableElems.length > 0) {
      // Prevent scrolling transition once the scrollbox is created.
      this._scrollTo(navigableElems[0]);
      window.getComputedStyle(this.listElem).width;
    }
    this._spatialNavigator = new SpatialNavigator(navigableElems);
    this._spatialNavigator.on('focus', this._handleFocus.bind(this));
    this._spatialNavigator.on('unfocus', this._handleUnfocus.bind(this));

    // handle appendChild and removeChild in scrollbox
    this._observer = new MutationObserver(this._handleMutation.bind(this));
    this._observer.observe(this, {
      childList: true
    });

    this.addEventListener('transitionend', this);
    this.addEventListener('scroll', this);
    this.addEventListener('focus', this);
    this.addEventListener('blur', this);

    this.listElem.classList.add('scrollbox-list-transition');
  };

  /**
   * Current focused element
   */
  Object.defineProperty(proto, 'currentElement', {
    get: function() {
      return this._spatialNavigator.getFocusedElement();
    }
  });

  /**
   * Blur the currentElement
   */
  proto.blur = function() {
    if (this.currentElement) {
      this.currentElement.blur();
    }
  };

  /**
   * Focus an element in scrollbox. If the input element is a number, it will
   * focus the first navigable element in the node which is children[number].
   * If the element is not navigable, it will focus the first navigable element
   * in the same node as the element.
   */
  proto.focus = function(element) {
    if (!element) {
      return this.focus(0);
    }

    if (typeof element === 'number') {
      element = this.children[element];
    }

    // focus the first navigable element if the element is not navigable
    if (!element.classList.contains('navigable')) {
      element = this._getNodeFromElement(element).querySelector('.navigable');
    }

    if (element) {
      this._spatialNavigator.focus(element);
      return true;
    }

    return false;
  };

  /**
   * Move the focus element
   */
  proto.move = function(direction) {
    return this._spatialNavigator.move(direction);
  };

  /**
   * Add navigable elements in scrollbox
   */
  proto.addNavigableElems = function(navigableElems) {
    return this._spatialNavigator.multiAdd(navigableElems);
  };

  /**
   * Remove navigable elements in scrollbox
   */
  proto.removeNavigableElems = function(navigableElems) {
    return this._spatialNavigator.multiRemove(navigableElems);
  };

  proto.handleEvent = function (evt) {

    switch (evt.type) {
      case 'transitionend':
        if (evt.target === this && evt.propertyName === 'transform') {
          this._fireEvent('scrollbox-scroll', {
            element: this
          });
        }
        break;
      case 'scroll':
        // Gecko may scroll the scrollbox automatically, we want to prevent this
        // behavior inorder to have correct view.
        if (evt.target === this) {
          evt.target.scrollLeft = 0;
        }
        break;
    }
  };

  /**
   * Get the node element containing the input element
   */
  proto._getNodeFromElement = function(element) {
    if (!element) {
      return null;
    }

    var nodeElem = element;
    // Find the node element. If the node is removed from scrollbox, its parent
    // will be null, so we have to check the parent node exists.
    while (nodeElem.parentElement && nodeElem.parentElement !== this) {
      nodeElem = nodeElem.parentElement;
    }

    return nodeElem;
  };

  /**
   * Scroll the list to the input element
   */
  proto._scrollTo = function(element) {
    this.translateX = this._getScrollOffset(this._getNodeFromElement(element));
    this.listElem.style.transform = 'translateX(' + this.translateX + 'px)';
  };


  /**
   * Get the offset of the node element
   */
  proto._getScrollOffset = function(nodeElem) {
    var nodeLeft = nodeElem.offsetLeft;
    var nodeWidth = nodeElem.offsetWidth;
    var listWidth = this.listElem.offsetWidth;
    var newTranslate = this.translateX;

    if (listWidth < this.viewWidth) {
      // align to horizontal center if list width is smaller than the container
      return (this.viewWidth - listWidth) / 2 + this.margin;
    } else if (nodeLeft + nodeWidth >
                          -this.translateX + this.viewWidth + this.margin) {
      // scroll left if the node falls beyond the right edge of container
      newTranslate = this.viewWidth - nodeLeft - nodeWidth + this.margin;
    } else if (nodeLeft < -this.translateX + this.margin) {
      // scroll right if the node falls beyond the left edge of container
      newTranslate = -nodeLeft + this.margin;
    }

    // If the new scroll offset contains first/last node, we have to align the
    // list to begin/end.
    if (this.lastElementChild.offsetLeft + this.lastElementChild.offsetWidth <=
                             -newTranslate + this.viewWidth + this.margin) {
      return this.viewWidth + this.margin - this.lastElementChild.offsetLeft -
                                            this.lastElementChild.offsetWidth;
    } else if (this.firstElementChild.offsetLeft >=
                                              -newTranslate + this.margin) {
      return -this.firstElementChild.offsetLeft + this.margin;
    }
    return newTranslate;
  };

  /**
   * Handle focus from spacial navigator
   */
  proto._handleFocus = function(element) {
    var nodeElem = this._getNodeFromElement(element);
    this._scrollTo(element);
    this._fireEvent('focus', {
      element: element,
      nodeElem: nodeElem,
      index: Array.prototype.indexOf.call(this.children, nodeElem)
    });

    // Since we may have many navigable elements in one node,
    // active-node-changed event happens when active node is changed (navigating
    // elements in the same node will not fire this event).
    if (this.currentNode && this.currentNode !== nodeElem) {
      this._fireEvent('active-node-changed', {
        scrollbox: this,
        oldNodeElem: this.currentNode,
        newNodeElem: nodeElem
      });
    }
    this.currentNode = nodeElem;
    element.focus();
  };

  /**
   * Handle unfocus from spacial navigator
   */
  proto._handleUnfocus = function(element) {
    var nodeElem = this._getNodeFromElement(element);
    this._fireEvent('blur', {
      element: element,
      nodeElem: nodeElem,
      index: Array.prototype.indexOf.call(this.children, nodeElem)
    });
    element.blur();
  };

  /**
   * Add/Remove elements to/from spacial navigator when a child is
   * added/removed.
   */
  proto._handleMutation = function(mutations) {
    mutations.forEach(function(mutation) {
      var prevElem = mutation.previousSibling;
      var nextElem = mutation.nextSibling;
      if (prevElem) {
        prevElem = (prevElem.nodeType === Node.ELEMENT_NODE)?
                                    prevElem : prevElem.previousElementSibling;
      }
      if (nextElem) {
        nextElem = (nextElem.nodeType === Node.ELEMENT_NODE)?
                                    nextElem : nextElem.nextElementSibling;
      }

      var nodes;
      if (mutation.type === 'childList') {
        nodes = Array.prototype.slice.call(mutation.addedNodes);
        // add every element to spacial navigator
        nodes.forEach(this._onNodeAdded, this);

        nodes = Array.prototype.slice.call(mutation.removedNodes);
        // remove every element from spacial navigator
        nodes.forEach(function(node) {
          this._onNodeRemoved(node, prevElem, nextElem);
        }, this);
      }
    }, this);
  };

  proto._onNodeAdded = function(node) {
    var navigableElems = Array.prototype.slice.call(
                                  node.getElementsByClassName('navigable'));
    if (node.classList.contains('navigable')) {
      navigableElems.push(node);
    }
    this._spatialNavigator.multiAdd(navigableElems);
    this._fireEvent('node-added', {
      node: node
    });
  };

  proto._onNodeRemoved = function(node, prevElem, nextElem) {
    var navigableElems = Array.prototype.slice.call(
                                  node.getElementsByClassName('navigable'));
    if (node.classList.contains('navigable')) {
      navigableElems.push(node);
    }
    this._spatialNavigator.multiRemove(navigableElems);
    // If the removed node is active, then we have to transfer the active
    // node to the nearest node. Otherwise, adjust the scroll offset
    if (node === this.currentNode) {
      if (prevElem) {
        this.focus(prevElem);
      } else {
        this.focus(nextElem);
      }
    }
    this._fireEvent('node-removed', {
      node: node
    });
  };

  proto._fireEvent = function(event, detail) {
    var evtObject = new CustomEvent(event, {
                                      bubbles: false,
                                      detail: detail || this
                                    });
    this.dispatchEvent(evtObject);
  };

  // scrollbox template
  var template = document.createElement('template');
  template.innerHTML =
    `<style>
      #scrollbox-list {
        position: relative;
        display: inline-block;
        height: 100%;
        white-space: nowrap;
        transform-origin: 0 50%;
      }
      #scrollbox-list.scrollbox-list-transition {
        transition: transform 0.2s ease;
      }
    </style>

    <div id="scrollbox-list">
      <content></content>
    </div>`;

  return document.registerElement('smart-scrollbox', { prototype: proto });
})(window);

