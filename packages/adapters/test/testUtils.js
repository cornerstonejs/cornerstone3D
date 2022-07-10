import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import unzipper from "unzipper";
import followRedirects from "follow-redirects";
import { promisify } from "util";

const { https } = followRedirects;

function downloadToFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        https
            .get(url, response => {
                response.pipe(fileStream);
                fileStream.on("finish", () => {
                    resolve(filePath);
                });
            })
            .on("error", reject);
    });
}

function unzip(zipFilePath, targetPath) {
  return new Promise(resolve => {
        fs.createReadStream(zipFilePath).pipe(
            unzipper.Extract({ path: targetPath }).on("close", resolve)
        );
    });
}

function ensureTestDataDir() {
  var targetPath = path.join(os.tmpdir(), "dcmjs-test")
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath)
  }
  return targetPath
}

async function getZippedTestDataset(url, filename, unpackDirectory) {
  var dir = ensureTestDataDir()
  var targetPath = path.join(dir, filename);
  var unpackPath = path.join(dir, unpackDirectory);
  if (!fs.existsSync(unpackPath)) {
    await downloadToFile(url, targetPath)
    await unzip(targetPath, unpackPath)
  }
  return unpackPath
}

async function getTestDataset(url, filename) {
  var dir = ensureTestDataDir()
  var targetPath = path.join(dir, filename);
  if (!fs.existsSync(targetPath)) {
    await downloadToFile(url, targetPath)
  }
  return targetPath
}

export {
  getTestDataset, getZippedTestDataset
}
