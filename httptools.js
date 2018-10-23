const nodefetch = require('node-fetch'); // Note, were using node-fetch-npm which had a warning in webpack see https://github.com/bitinn/node-fetch/issues/421 and is intended for clients
const errors = require('./Errors'); // Standard Dweb Errors
const debught = require('debug')('dweb-transports:httptools');

//var fetch,Headers,Request;
//if (typeof(Window) === "undefined") {
if (typeof(fetch) === "undefined") {
    //var fetch = require('whatwg-fetch').fetch; //Not as good as node-fetch-npm, but might be the polyfill needed for browser.safari
    //XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;  // Note this doesnt work if set to a var or const, needed by whatwg-fetch
    fetch = nodefetch;
    Headers = fetch.Headers;      // A class
    Request = fetch.Request;      // A class
} /* else {
    // If on a browser, need to find fetch,Headers,Request in window
    console.log("Loading browser version of fetch,Headers,Request");
    fetch = window.fetch;
    Headers = window.Headers;
    Request = window.Request;
} */
//TODO-HTTP to work on Safari or mobile will require a polyfill, see https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch for comment


httptools = {};

async function loopfetch(req, ms, count, what) {
    /*
    A workaround for a nasty Chrome issue which fails if there is a (cross-origin?) fetch of more than 6 files.  See other WORKAROUND-CHROME-CROSSORIGINFETCH
    Loops at longer and longer intervals trying
    req:        Request
    ms:         Initial wait between polls
    count:      Max number of times to try (0 means just once)
    what:       Name of what retrieving for log (usually file name or URL)
    returns Response:
     */
    let lasterr;
    let loopguard = (typeof window != "undefined") && window.loopguard; // Optional global parameter, will cancel any loops if changes
    while (count-- && (loopguard === ((typeof window != "undefined") && window.loopguard)) ) {
        try {
            return await fetch(req);
        } catch(err) {
            lasterr = err;
            debught("Delaying %s by %d ms because %s", what, ms, err.message);
            await new Promise(resolve => {setTimeout(() => { resolve(); },ms)})
            ms = ms*(1+Math.random()); // Spread out delays incase all requesting same time
        }
    }
    console.warn("loopfetch of",what,"failed");
    if (loopguard !== ((typeof window != "undefined") && window.loopguard)) {
        debught("Looping exited because of page change %s", what);
        throw new Error("Looping exited because of page change "+ what)
    } else {
        throw(lasterr);
    }
}

httptools.p_httpfetch = async function(httpurl, init, {wantstream=false}={}) { // Embrace and extend "fetch" to check result etc.
    /*
    Fetch a url

    httpurl: optional (depends on command)
    init:   {headers}
    resolves to: data as text or json depending on Content-Type header
    throws: TransportError if fails to fetch
    //TODO explicitly parameterise if want it to loop
     */
    try {
        debught("p_httpfetch: %s %o", httpurl, init.headers.get("range"));
        //console.log('CTX=',init["headers"].get('Content-Type'))
        // Using window.fetch, because it doesn't appear to be in scope otherwise in the browser.
        let req = new Request(httpurl, init);
        //let response = await fetch(req);
        let response = await loopfetch(req, 500, 12, "fetching "+httpurl);
        // fetch throws (on Chrome, untested on Firefox or Node) TypeError: Failed to fetch)
        // Note response.body gets a stream and response.blob gets a blob and response.arrayBuffer gets a buffer.
        if (response.ok) {
            let contenttype = response.headers.get('Content-Type');
            if (wantstream) {
                return response.body; // Note property while json() or text() are functions
            } else if (contenttype === "application/json") {
                return response.json(); // promise resolving to JSON
            } else if ((contenttype !== "undefined") && contenttype.startsWith("text")) { // Note in particular this is used for responses to store
                return response.text();
            } else { // Typically application/octetStream when don't know what fetching
                return new Buffer(await response.arrayBuffer()); // Convert arrayBuffer to Buffer which is much more usable currently
            }
        }
        // noinspection ExceptionCaughtLocallyJS
        throw new errors.TransportError(`Transport Error ${response.status}: ${response.statusText}`);
    } catch (err) {
        // Error here is particularly unhelpful - if rejected during the COrs process it throws a TypeError
        debught("p_httpfetch failed: %s", err.message); //  note TypeErrors are generated by CORS or the Chrome anti DDOS 'feature' should catch them here and comment
        if (err instanceof errors.TransportError) {
            throw err;
        } else {
            throw new errors.TransportError(`Transport error thrown by ${httpurl}: ${err.message}`);
        }
    }
}


httptools.p_GET = function(httpurl, opts={}) {
    /*  Locate and return a block, based on its url
        Throws TransportError if fails
        opts {
            start, end,     // Range of bytes wanted - inclusive i.e. 0,1023 is 1024 bytes
            wantstream,     // Return a stream rather than data
            }
        resolves to: URL that can be used to fetch the resource, of form contenthash:/contenthash/Q123
    */
    let headers = new Headers();
    if (opts.start || opts.end) headers.append("range", `bytes=${opts.start || 0}-${(opts.end<Infinity) ? opts.end : ""}`);
    let init = {    //https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        method: 'GET',
        headers: headers,
        mode: 'cors',
        cache: 'default',
        redirect: 'follow',  // Chrome defaults to manual
        keepalive: true    // Keep alive - mostly we'll be going back to same places a lot
    };
    return httptools.p_httpfetch(httpurl, init, {wantstream: opts.wantstream}); // This s a real http url
}
httptools.p_POST = function(httpurl, type, data) {
    // Locate and return a block, based on its url
    // Throws TransportError if fails
    //let headers = new window.Headers();
    //headers.set('content-type',type); Doesn't work, it ignores it
    let init = {
        //https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        //https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name for headers tat cant be set
        method: 'POST',
        headers: {}, //headers,
        //body: new Buffer(data),
        body: data,
        mode: 'cors',
        cache: 'default',
        redirect: 'follow',  // Chrome defaults to manual
        keepalive: true    // Keep alive - mostly we'll be going back to same places a lot
    };
    return httptools.p_httpfetch(httpurl, init);
}

exports = module.exports = httptools;