// This script provides a secure way to check remotely whether the node is mining/sealing blocks or
// not. It does this by redirecting requests to a locally open RPC port of Parity. That port can be
// closed for remote requests thus alleviating security concerns related to remote RPC calls.

var assert = require("assert");
const http = require("http");
const ethers = require("ethers");

// Local Parity RPC port.
const RPC_PORT = "8541";
// isMining server port open for remote connections.
const SERVER_PORT = "15116";

var provider = new ethers.providers.JsonRpcProvider(`http://localhost:${RPC_PORT}`);

async function isMining() {
    try {
        let response = await provider.send("eth_mining", []);
        assert(typeof response === "boolean");
        return response;
    } catch (e) {
        console.log("isMining ERROR:" + e);
        return false;
    }
}

function requestHandler(request, response) {
    response.writeHead(200, {"Content-Type": "text/plain"});
    isMining().then(b => {
        if (b) {
            response.end("true");
        } else {
            response.end("false");
        }
    }).catch(e => {
        response.end("false");
    });
}

var server = http.createServer(requestHandler);
server.listen(SERVER_PORT);
console.log(`Listening on port ${SERVER_PORT} and serving on port ${SERVER_PORT}`);
