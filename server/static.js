"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveStatic = serveStatic;
var express_1 = require("express");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
function serveStatic(app) {
    var distPath = node_path_1.default.resolve(__dirname, "public");
    if (!node_fs_1.default.existsSync(distPath)) {
        throw new Error("Could not find the build directory: ".concat(distPath, ", make sure to build the client first"));
    }
    app.use(express_1.default.static(distPath));
    // fall through to index.html if the file doesn't exist
    app.use("/{*path}", function (_req, res) {
        res.sendFile(node_path_1.default.resolve(distPath, "index.html"));
    });
}
