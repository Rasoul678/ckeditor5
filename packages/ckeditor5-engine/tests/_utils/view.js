/**
 * @license Copyright (c) 2003-2016, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/* jshint latedef:false */

import ViewDocumentFragment from '/ckeditor5/engine/treeview/documentfragment.js';
import HtmlDataProcessor from '/ckeditor5/engine/dataprocessor/htmldataprocessor.js';
import ViewElement from '/ckeditor5/engine/treeview/element.js';
import Selection from '/ckeditor5/engine/treeview/selection.js';
import Range from '/ckeditor5/engine/treeview/range.js';
import Position from '/ckeditor5/engine/treeview/position.js';
import AttributeElement from '/ckeditor5/engine/treeview/attributeelement.js';
import ContainerElement from '/ckeditor5/engine/treeview/containerelement.js';
import ViewText from '/ckeditor5/engine/treeview/text.js';

const DomDocumentFragment = window.DocumentFragment;
const DomElement = window.Element;

const ELEMENT_RANGE_START_TOKEN = '[';
const ELEMENT_RANGE_END_TOKEN = ']';
const TEXT_RANGE_START_TOKEN = '{';
const TEXT_RANGE_END_TOKEN = '}';

/**
 * Converts view elements to its string representation, an HTML-like string.
 * Root element can be provided as {@link engine.treeView.Element Element} or
 * {@link engine.treeView.DocumentFragment DocumentFragment}.
 *
 *		const text = new Text( 'foobar' );
 *		const b = new Element( 'b', { name: 'test' }, text );
 *		const p = new Element( 'p', { style: 'color:red;' }, b );
 *
 *		getData( p ); // <p style="color:red;"><b name="test">foobar</b></p>
 *
 * Additionally {@link engine.treeView.Selection Selection}
 * instance can be provided, then ranges from that selection will be converted too. If range position is placed inside
 * element node `[` and `]` will be used there.
 *
 *		const text = new Text( 'foobar' );
 *		const b = new Element( 'b', null, text );
 *		const p = new Element( 'p', null, b );
 *		const selection = new Selection();
 *		selection.addRange( Range.createFromParentsAndOffsets( p, 0, p, 1 ) );
 *
 *		getData( p, selection ); // <p>[<b>foobar</b>]</p>
 *
 * If range is placed inside text node `{` and `}` will be used there.
 *
 *		const text = new Text( 'foobar' );
 *		const b = new Element( 'b', null, text );
 *		const p = new Element( 'p', null, b );
 *		const selection = new Selection();
 *		selection.addRange( Range.createFromParentsAndOffsets( text, 1, text, 5 ) );
 *
 *		getData( p, selection ); // <p><b>f{ooba}r</b></p>
 *
 * Additional options object can be provided.
 * If `options.showType` property is set to `true` element types will be
 * presented for {@link engine.treeView.AttributeElement AttributeElements} and {@link engine.treeView.ContainerElement
 * ContainerElements}.
 *
 *		const attribute = new AttributeElement( 'b' );
 *		const container = new ContainerElement( 'p' );
 *		getData( attribute, null, { showType: true } ); // <attribute:b></attribute:b>
 *		getData( container, null, { showType: true } ); // <container:p></container:p>
 *
 * if `options.showPriority` property is set to `true`, priority will be displayed for all
 * {@link engine.treeView.AttributeElement AttributeElements}.
 *
 *		const attribute = new AttributeElement( 'b' );
 *		attribute.priority = 20;
 *		getData( attribute, null, { showPriority: true } ); // <b priority=20></b>
 *
 * @param {engine.treeView.Node} node
 * @param {engine.treeView.Selection} [selection]
 * @param {Object} [options]
 * @param {Boolean} [options.showType=false] When set to `true` type of elements will be printed ( `<container:p>`
 * instead of `<p>` and `<attribute:b>` instead of `<b>`.
 * @param {Boolean} [options.showPriority=false] When set to `true` AttributeElement's priority will be printed.
 * @returns {String}
 */
export function stringify( node, selection, options = {} ) {
	const viewStringify = new ViewStringify( node, selection, options );

	return viewStringify.stringify();
}

export function parse( data, options = { } ) {
	options.order = options.order || [];
	const viewParser = new ViewParser();
	const rangeParser = new RangeParser();

	const view = viewParser.parse( data );
	const ranges = rangeParser.parse( view, options.order );

	// When ranges are present - return object containing view, and selection.
	if ( ranges.length ) {
		const selection = new Selection();
		selection.setRanges( ranges, !!options.lastRangeBackward );

		return {
			view: view,
			selection: selection
		};
	}

	return view;
}

class RangeParser {
	constructor() {
		// Todo - set in parse method.
		this._positions = [];
	}

	parse( node, order ) {
		this._getPositions( node );
		let ranges = this._createRanges();

		// Sort ranges if needed.
		if ( order.length ) {
			if ( order.length != ranges.length ) {
				throw new Error(
					`There are ${ ranges.length} ranges found, but ranges order array contains ${ order.length } elements.`
				);
			}

			ranges = this._sortRanges( ranges,  order );
		}

		return ranges;
	}

	_sortRanges( ranges, rangesOrder ) {
		const sortedRanges = [];
		let index = 0;

		for ( let newPosition of rangesOrder ) {
			if ( ranges[ newPosition - 1 ] === undefined ) {
				throw new Error( 'Provided ranges order is invalid.' );
			}

			sortedRanges[ newPosition - 1] = ranges[ index ];
			index++;
		}

		return sortedRanges;
	}

	_getPositions( node ) {
		if ( node instanceof ViewDocumentFragment || node instanceof ViewElement ) {
			// Copy elements into the array, when items will be removed from node this array will still have all the
			// items needed for iteration.
			const children = Array.from( node.getChildren() );

			for ( let child of children ) {
				this._getPositions( child );
			}
		}

		if ( node instanceof ViewText ) {
			const regexp = new RegExp(
				`[ ${TEXT_RANGE_START_TOKEN}${TEXT_RANGE_END_TOKEN}\\${ELEMENT_RANGE_END_TOKEN}\\${ELEMENT_RANGE_START_TOKEN} ]`,
				'g'
			);
			let text = node.data;
			let match;
			let offset = 0;
			const brackets = [];

			// Remove brackets from text and store info about offset inside text node.
			while ( ( match = regexp.exec( text ) ) ) {
				const index = match.index;
				const bracket = match[ 0 ];

				brackets.push( {
					bracket: bracket,
					textOffset: index - offset
				} );

				offset++;
			}
			text = text.replace( regexp, '' );
			node.data = text;
			const index = node.getIndex();
			const parent = node.parent;

			// Remove empty text nodes.
			if ( !text ) {
				node.remove();
			}

			for ( let item of brackets ) {
				// Non-empty text node.
				if ( text ) {
					if ( item.bracket == TEXT_RANGE_START_TOKEN || item.bracket == TEXT_RANGE_END_TOKEN ) {
						// Store information about text range delimiter.
						this._positions.push( {
							bracket: item.bracket,
							position: new Position( node, item.textOffset )
						} );
					} else {
						// Check if element range delimiter is not placed inside text node.
						if ( item.textOffset !== 0 && item.textOffset !== text.length ) {
							throw new Error( `Range delimiter '${ item.bracket }' is placed inside text node.` );
						}

						// If bracket is placed at the end of the text node - it should be positioned after it.
						const offset = ( item.textOffset === 0 ? index : index + 1 );

						// Store information about element range delimiter.
						this._positions.push( {
							bracket: item.bracket,
							position: new Position( parent, offset )
						} );
					}
				} else {
					if ( item.bracket == TEXT_RANGE_START_TOKEN || item.bracket == TEXT_RANGE_END_TOKEN ) {
						throw new Error( `Text range delimiter '${ item.bracket }' is placed inside empty text node. ` );
					}

					// Store information about element range delimiter.
					this._positions.push( {
						bracket: item.bracket,
						position: new Position( parent, index )
					} );
				}
			}
		}
	}

	_createRanges() {
		const ranges = [];
		let range = null;

		for ( let item of this._positions ) {
			// When end of range is found without opening.
			if ( !range && ( item.bracket == ELEMENT_RANGE_END_TOKEN || item.bracket == TEXT_RANGE_END_TOKEN ) ) {
				throw new Error( `End of range was found '${ item.bracket }' but range was not started before.` );
			}

			// When second start of range is found when one is already opened - selection does not allow intersecting
			// ranges.
			if ( range && ( item.bracket == ELEMENT_RANGE_START_TOKEN || item.bracket == TEXT_RANGE_START_TOKEN ) ) {
				throw new Error( `Start of range was found '${ item.bracket }' but one range is already started.` );
			}

			if ( item.bracket == ELEMENT_RANGE_START_TOKEN || item.bracket == TEXT_RANGE_START_TOKEN ) {
				range = new Range( item.position, item.position );
			} else {
				range.end = item.position;
				ranges.push( range );
				range = null;
			}
		}

		// Check if all ranges have proper ending.
		if ( range !== null ) {
			throw new Error( 'Range was started but no end delimiter was found.' );
		}

		return ranges;
	}
}

class ViewParser {
	parse( data ) {
		const htmlProcessor = new HtmlDataProcessor();
		const domRoot = htmlProcessor.toDom( data );

		return this._walkDom( domRoot );
	}

	_walkDom( domNode ) {
		const isDomElement = domNode instanceof DomElement;

		if ( isDomElement || domNode instanceof DomDocumentFragment ) {
			const children = domNode.childNodes;
			const length = children.length;

			// If there is only one element inside DOM DocumentFragment - use it as root.
			if ( !isDomElement && length == 1 ) {
				return this._walkDom( domNode.childNodes[ 0 ] );
			}

			let viewElement;

			if ( isDomElement ) {
				viewElement = this._convertElement( domNode );
			} else {
				viewElement = new ViewDocumentFragment();
			}

			for ( let i = 0; i < children.length; i++ ) {
				const child = children[ i ];
				viewElement.appendChildren( this._walkDom( child ) );
			}

			return viewElement;
		}

		return new ViewText( domNode.textContent );
	}

	_convertElement( domElement ) {
		const info = this._convertElementName( domElement );
		let viewElement;

		if ( info.type == 'attribute' ) {
			viewElement = new AttributeElement( info.name );

			if ( info.priority !== null ) {
				viewElement.priority = info.priority;
			}
		} else if ( info.type == 'container' ) {
			viewElement = new ContainerElement( info.name );
		} else {
			viewElement = new ViewElement( info.name );
		}

		const attributes = domElement.attributes;
		const attributesCount = attributes.length;

		for ( let i = 0; i < attributesCount; i++ ) {
			const attribute = attributes[ i ];
			viewElement.setAttribute( attribute.name, attribute.value );
		}

		return viewElement;
	}

	_convertElementName( element ) {
		const parts = element.tagName.toLowerCase().split( ':' );

		if ( parts.length == 1 ) {
			return {
				name: parts[ 0 ],
				type: null,
				priority: null
			};
		}

		if ( parts.length == 2 ) {
			// Check if type and name: container:div.
			const type = this._convertType( parts[ 0 ] );

			if ( type ) {
				return {
					name: parts[ 1 ],
					type: type,
					priority: null
				};
			}

			// Check if name and priority: span:10.
			const priority = this._convertPriority( parts[ 1 ] );

			if ( priority !== null ) {
				return {
					name: parts[ 0 ],
					type: 'attribute',
					priority: priority
				};
			}

			throw new Error( `Cannot parse element's tag name: ${ element.tagName.toLowerCase() }.` );
		}

		// Check if name is in format type:name:priority.
		if ( parts.length === 3 ) {
			const type = this._convertType( parts[ 0 ] );
			const priority = this._convertPriority( parts[ 2 ] );

			if ( type && priority !== null ) {
				return {
					name: parts[ 1 ],
					type: type,
					priority: priority
				};
			}
		}

		throw new Error( `Cannot parse element's tag name: ${ element.tagName.toLowerCase() }.` );
	}

	_convertType( type ) {
		if ( type == 'container' || type == 'attribute' ) {
			return type;
		}

		return null;
	}

	_convertPriority( priorityString ) {
		const priority = parseInt( priorityString, 10 );

		if ( !isNaN( priority ) ) {
			return priority;
		}

		return null;
	}

}

/**
 * Private helper class used for converting view tree to string.
 *
 * @private
 */
class ViewStringify {
	/**
	 * Creates ViewStringify instance.
	 * @param root
	 * @param {engine.treeView.Selection} [selection=null] Selection which ranges should be also converted to string.
	 * @param {Object} [options] Options object.
	 * @param {Boolean} [options.showType=false] When set to `true` type of elements will be printed ( `<container:p>`
	 * instead of `<p>` and `<attribute:b>` instead of `<b>`.
	 * @param {Boolean} [options.showPriority=false] When set to `true` AttributeElement's priority will be printed.
	 */
	constructor( root, selection = null, options = {} ) {
		this.root = root;
		this.selection = selection;
		this.ranges = [];

		if ( this.selection ) {
			this.ranges = [ ...selection.getRanges() ];
		}

		this.showType = !!options.showType;
		this.showPriority = !!options.showPriority;
	}

	/**
	 * Converts view to string.
	 *
	 * @returns {string} String representation of the view elements.
	 */
	stringify() {
		let result = '';
		this._walkView( this.root, ( chunk ) => {
			result += chunk;
		} );

		return result;
	}

	/**
	 * Executes simple walker that iterates over all elements in the view tree starting from root element.
	 * Calls `callback` with parsed chunks of string data.
	 *
	 * @private
	 * @param {engine.treeView.DocumentFragment|engine.treeView.Element|engine.treeView.Text} root
	 * @param {Function} callback
	 */
	_walkView( root, callback ) {
		const isElement = root instanceof ViewElement;

		if ( isElement || root instanceof ViewDocumentFragment ) {
			if ( isElement ) {
				callback( this._stringifyElementOpen( root ) );
			}

			let offset = 0;
			callback( this._stringifyElementRanges( root, offset ) );

			for ( let child of root.getChildren() ) {
				this._walkView( child, callback );
				offset++;
				callback( this._stringifyElementRanges( root, offset ) );
			}

			if ( isElement ) {
				callback( this._stringifyElementClose( root ) );
			}
		}

		if ( root instanceof ViewText ) {
			callback( this._stringifyTextRanges( root ) );
		}
	}

	/**
	 * Checks if given {@link engine.treeView.Element Element} has {@link engine.treeView.Range#start range start} or
	 * {@link engine.treeView.Range#start range end} placed at given offset and returns its string representation.
	 *
	 * @private
	 * @param {engine.treeView.Element} element
	 * @param {Number} offset
	 */
	_stringifyElementRanges( element, offset ) {
		let start = '';
		let end = '';
		let collapsed = '';

		for ( let range of this.ranges ) {
			if ( range.start.parent == element && range.start.offset === offset ) {
				if ( range.isCollapsed ) {
					collapsed += ELEMENT_RANGE_START_TOKEN + ELEMENT_RANGE_END_TOKEN;
				} else {
					start += ELEMENT_RANGE_START_TOKEN;
				}
			}

			if ( range.end.parent === element && range.end.offset === offset && !range.isCollapsed ) {
				end += ELEMENT_RANGE_END_TOKEN;
			}
		}

		return end + collapsed + start;
	}

	/**
	 * Checks if given {@link engine.treeView.Element Text node} has {@link engine.treeView.Range#start range start} or
	 * {@link engine.treeView.Range#start range end} placed somewhere inside. Returns string representation of text
	 * with range delimiters placed inside.
	 *
	 * @private
	 * @param {engine.treeView.Text} node
	 */
	_stringifyTextRanges( node ) {
		const length = node.data.length;
		let result = node.data.split( '' );

		// Add one more element for ranges ending after last character in text.
		result[ length ] = '';

		// Represent each letter as object with information about opening/closing ranges at each offset.
		result = result.map( ( letter ) => {
			return {
				letter: letter,
				start: '',
				end: '',
				collapsed: ''
			};
		}  );

		for ( let range of this.ranges ) {
			const start = range.start;
			const end = range.end;

			if ( start.parent == node && start.offset >= 0 && start.offset <= length ) {
				if ( range.isCollapsed ) {
					result[ end.offset ].collapsed += TEXT_RANGE_START_TOKEN + TEXT_RANGE_END_TOKEN;
				} else {
					result[ start.offset ].start += TEXT_RANGE_START_TOKEN;
				}
			}

			if ( end.parent == node && end.offset >= 0 && end.offset <= length && !range.isCollapsed  ) {
				result[ end.offset ].end += TEXT_RANGE_END_TOKEN;
			}
		}

		return result.map( item => item.end + item.collapsed + item.start + item.letter ).join( '' );
	}

	/**
	 * Converts passed {@link engine.treeView.Element Element} to opening tag.
	 * Depending on current configuration opening tag can be simple (`<a>`), contain type prefix (`<container:p>` or
	 * `<attribute:a>`), contain priority information ( `<attribute:a priority=20>` ). Element's attributes also
	 * will be included (`<a href="http://ckeditor.com" name="foobar">`).
	 *
	 * @private
	 * @param {engine.treeView.Element} element
	 * @returns {string}
	 */
	_stringifyElementOpen( element ) {
		const priority = this._stringifyElementPriority( element );
		const type = this._stringifyElementType( element );
		const name = [ type, element.name, priority ].filter( i=> i !== '' ).join( ':' );
		const attributes = this._stringifyElementAttributes( element );
		const parts = [ name, attributes ];

		return `<${ parts.filter( i => i !== '' ).join( ' ' ) }>`;
	}

	/**
	 * Converts passed {@link engine.treeView.Element Element} to closing tag.
	 * Depending on current configuration opening tag can be simple (`</a>`) or contain type prefix (`</container:p>` or
	 * `</attribute:a>`).
	 *
	 * @private
	 * @param {engine.treeView.Element} element
	 * @returns {string}
	 */
	_stringifyElementClose( element ) {
		const priority = this._stringifyElementPriority( element );
		const type = this._stringifyElementType( element );
		const name = [ type, element.name, priority ].filter( i=> i !== '' ).join( ':' );

		return `</${ name }>`;
	}

	/**
	 * Converts passed {@link engine.treeView.Element Element's} type to its string representation
	 * Returns 'attribute' for {@link engine.treeView.AttributeElement AttributeElements} and
	 * 'container' for {@link engine.treeView.ContainerElement ContainerElements}. Returns empty string when current
	 * configuration is preventing showing elements' types.
	 *
	 * @private
	 * @param {engine.treeView.Element} element
	 * @returns {string}
	 */
	_stringifyElementType( element ) {
		if ( this.showType ) {
			if ( element instanceof AttributeElement ) {
				return 'attribute';
			}

			if ( element instanceof ContainerElement ) {
				return 'container';
			}
		}

		return '';
	}

	/**
	 * Converts passed {@link engine.treeView.Element Element} to its priority representation.
	 * Priority string representation will be returned when passed element is an instance of
	 * {@link engine.treeView.AttributeElement AttributeElement} and current configuration allow to show priority.
	 * Otherwise returns empty string.
	 *
	 * @private
	 * @param {engine.treeView.Element} element
	 * @returns {string}
	 */
	_stringifyElementPriority( element ) {
		if ( this.showPriority && element instanceof AttributeElement ) {
			return element.priority;
		}

		return '';
	}

	/**
	 * Converts passed {@link engine.treeView.Element Element} attributes to their string representation.
	 * If element has no attributes - empty string is returned.
	 *
	 * @private
	 * @param {engine.treeView.Element} element
	 * @returns {string}
	 */
	_stringifyElementAttributes( element ) {
		const attributes = [];

		// TODO: Maybe attributes should be put in alphabetical order, it might be easier to write expected string.
		for ( let attribute of element.getAttributeKeys() ) {
			attributes.push( `${ attribute }="${ element.getAttribute( attribute ) }"` );
		}

		return attributes.join( ' ' );
	}
}