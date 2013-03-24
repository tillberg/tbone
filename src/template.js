/**
 * Convenience function to generate a RegExp from a string.  Spaces in the original string
 * are re-interpreted to mean a sequence of zero or more whitespace characters.
 * @param  {String} str
 * @param  {String} flags
 * @return {RegExp}
 */
function regexp(str, flags) {
    return new RegExp(str.replace(/ /g, '[\\s\\n]*'), flags);
}

/**
 * Capture the contents of any/all underscore template blocks.
 * @type {RegExp}
 * @const
 */
var rgxLookup = /<%(=|-|)([\s\S]+?)%>/g;

/**
 * Find function declaractions (so that we can detect variables added to the closure scope
 * inside a template, as well as start and end of scope).
 * @type {RegExp}
 * @const
 */
var rgxScope = regexp(
    'function \\( ([\\w$_]* (, [\\w$_]+)*)  \\)|' +
    '(\\{)|' +
    '(\\})|' +
    '([\\s\\S])', 'g');

/**
 * Match function parameters found in the first line of rgxScope.
 * @type {RegExp}
 * @const
 */
var rgxArgs = /[\w$_]+/g;

/**
 * When used with string.replace, rgxUnquoted matches unquoted segments with the first group
 * and quoted segments with the second group.
 * @type {RegExp}
 * @const
 */
var rgxUnquoted = /([^'"]+)('[^']+'|"[^"]+")?/g;

/**
 * Find references that are not subproperty references of something else, e.g. ").hello"
 * @type {RegExp}
 * @const
 */
var rgxLookupableRef = regexp('(\\. )?(([\\w$_]+)(\\.[\\w$_]+)*)', 'g');

/**
 * Use to test whether a string is in fact a number literal.  We don't want to instrument those.
 * @type {RegExp}
 * @const
 */
var rgxNumber = /^\d+$/;

var neverLookup = {};
_.each(('break case catch continue debugger default delete do else finally for function if in ' +
        'instanceof new return switch this throw try typeof var void while with ' +
        'Array Boolean Date Function Iterator Number Object RegExp String ' +
        'isFinite isNaN parseFloat parseInt Infinity JSON Math NaN undefined true false null ' +
        '$ _ tbone T'
       ).split(' '), function (word) {
    neverLookup[word] = true;
});

function dontPatch (namespace) {
    neverLookup[namespace] = true;
}

/**
 * Adds listeners for model value lookups to a template string
 * This allows us to automatically and dynamically bind to change events on the models
 * to auto-refresh this template.
 */
function withLookupListeners(str, textOp, closureVariables) {
    return str.replace(rgxLookupableRef, function (all, precedingDot, expr, firstArg) {
        if (neverLookup[firstArg] || precedingDot || rgxNumber.test(firstArg)) {
            return all;
        } else {
            if (closureVariables[firstArg] != null) {
                /**
                 * If the first part of the expression is a closure-bound variable
                 * e.g. from a _.each iterator, try to do a lookup on that (if it's
                 * a model).  Otherwise, just do a native reference.
                 */
                return [
                    '(',
                    firstArg,
                    ' && ',
                    firstArg,
                    '.isBindable ? ',
                    firstArg,
                    '.lookup',
                    textOp ? 'Text' : '',
                    '("',
                    expr.slice(firstArg.length + 1),
                    '")',
                    ' : ',
                    expr,
                    ')'
                ].join('');
            } else {
                /**
                 * Patch the reference to use lookup (or lookupText).
                 */
                return [
                    'tbone.lookup',
                    textOp ? 'Text' : '',
                    '(',
                    ITERATE_OVER_MODELS,
                    ', rootStr + "',
                    expr,
                    '")'
                ].join('');
            }
        }
    });
}

/**
 * Add a template to be used later via render.
 * @param {string} name   template name; should match tbone attribute references
 * @param {string} string template as HTML string
 */
function addTemplate(name, string) {
    templates[name] = string;
}

/**
 * Instrument the template for automatic reference binding via tbone.lookup/lookupText.
 * @param  {string} string Uninstrumented template as an HTML string
 * @return {function(Object): string}
 */
function initTemplate(string) {
    /**
     * As we parse through the template, we identify variables defined as function parameters
     * within the current closure scope; if a variable is defined, we instrument references to
     * that variable so that they use that variable as the lookup root, instead of using the
     * root context.  We push each new closure scope's variables onto varstack and pop them
     * off when we reach the end of the closure.
     * @type {Array.<Array.<string>>}
     */
    var varstack = [[]];
    /**
     * Hash set of variables that are currently in scope.
     * @type {Object.<string, boolean>}
     */
    var inClosure = {};

    function updateInClosure() {
        /**
         * Rebuild the hash set of variables that are "in closure scope"
         */
        inClosure = _['invert'](_.flatten(varstack));
    }
    updateInClosure();
    /**
     * First, find code blocks within the template.
     */
    var parsed = string.replace(rgxLookup, function (__, textOp, contents) {
        /**
         * List of accumulated instrumentable characters.
         * @type {Array.<string>}
         */
        var cs = [];

        /**
         * Inside the rgxScope replace function, we push unmatched characters one by one onto
         * cs.  Whenever we find any other input, we first flush cs by calling cs_parsed.
         * This calls withLookupListeners which does the magic of replacing native JS references
         * with calls to lookup or lookupText where appropriate.
         */
        function cs_parsed() {
            /**
             * Pass the accumulated string to withLookupListeners, replacing variable
             * references with calls to lookup.
             */
            var instrumented = withLookupListeners(cs.join(''), textOp, inClosure);
            cs = [];
            return instrumented;
        }

        /**
         * Find unquoted segments within the code block.  Pass quoted segments through unmodified.
         */
        var newContents = contents.replace(rgxUnquoted, function (__, unquoted, quoted) {
            /**
             * Process the unquoted segments, taking note of variables added in closure scope.
             * We should not lookup-patch variables that are defined in a closure (e.g. as the
             * looping variable of a _.each).
             */
            return unquoted.replace(rgxScope, function (all, args, __, openScope, closeScope, c) {
                if (c) {
                    /**
                     * Push a single character onto cs to be parsed in cs_parsed.  Obviously, not
                     * the most efficient mechanism possible.
                     */
                    cs.push(c);
                    return '';
                }
                if (openScope) {
                    /**
                     * We found a new function declaration; add a new closure scope to the stack.
                     */
                    varstack.push([]);
                } else if (args) {
                    /**
                     * We found an argument list for this function; add each of the arguments to
                     * the closure scope at the top of the stack (added above).
                     */
                    args.replace(rgxArgs, function (arg) {
                        varstack[varstack.length - 1].push(arg);
                    });
                } else if (closeScope) {
                    /**
                     * We found the closing brace for a closure scope.  Pop it off the stack to
                     * reflect that any variables attached to it are no longer in scope.
                     */
                    varstack.pop();
                }
                updateInClosure();
                /**
                 * Flush cs, and in addition to that, return the function/variables/brace that we
                 * just found.
                 */
                return cs_parsed() + all;
            }) + cs_parsed() + (quoted || '');
        }) + cs_parsed();
        return '<%' + textOp + newContents + '%>';
    });

    /**
     * Pass the template to _.template.  It will create a function that takes a single "root"
     * parameter.  On render, we'll pass either a model/collection or tbone itself as the root.
     * @type {Function}
     */
    var fn = _.template(parsed, null, { 'variable': 'rootStr' });
    /**
     * For debugging purposes, save a copy of the parsed template for reference.
     * @type {string}
     */
    fn.parsed = parsed;
    return fn;
}

function renderTemplate(id, rootStr) {
    var template = templates[id];
    if (!template) {
        error('Could not find template ' + id);
        return '';
    }
    if (typeof template === 'string') {
        template = templates[id] = initTemplate(template);
    }
    return template(rootStr ? rootStr + '.' : '');
}
