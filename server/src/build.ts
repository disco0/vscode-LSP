const chalk = require("chalk");
const log = require('fancy-log');
const fs = require('fs');
import {join, dirname, normalize, basename} from "path";
const jsonlint = require('jsonlint').parser;
const ajvmodule = require('ajv');
import * as _ from 'lodash';
import * as ls from "vscode-languageserver";

function getFiles(dir:string, fileList:string[], fileName:string){
  fileList = fileList || [];
  var files = fs.readdirSync(dir);
  for(var i in files){
      if (!files.hasOwnProperty(i)) {continue;}
      var name = dir+'/'+files[i];
      if (fs.statSync(name).isDirectory()){
          getFiles(name, fileList, fileName);
      } else {
          if(name.includes(fileName)){
            let norm_name = normalize(name);
            fileList.push(norm_name);
          }
      }
  }
  return fileList;
}

function getSchema(dir:string){
  while(basename(dir)!=="iAccess"){
    dir=dirname(dir);
  }
  dir = join(dir, "tools", "core", "dist", "dev", "web");
  let schemaArray = getFiles(dir,[], "schema.json");
  let len = schemaArray.length;
  if(len<1){
    console.error('No schemas found in workspace');
  }  else if(len>1){
    console.error('More than 1 schema found in workspace');
  }
  return schemaArray[0];
}
function getApplication(dir:string){
  while(basename(dir).length!==2){
    dir=dirname(dir);
  }
  let applicationArray = getFiles(dir,[], "application.json");
  let len = applicationArray.length;
  if(len<1){
    console.error('No applications found in workspace');
  }  else if(len>1){
    console.error('More than 1 application found in workspace');
  }
  return applicationArray[0];
}




export function buildApplicationSource(dirPath: string) {
    const applicationJsonPath = getApplication(dirPath);
    const application = doLoadApplication(applicationJsonPath);
    //validate(application)
    return application;
}
  
function doLoadApplication(applicationJsonPath: string): any /* IApplicationConfiguration */ {
    const application = resolveJsonRefs(applicationJsonPath, true);
    application['terms'] = {};
    log(`Loaded application from ${chalk.green(applicationJsonPath)}`);
    return application;
}

/**
 * Loads a file with the given filename and resolves all JSON references recursively.
 * @param filename a JSON file
 * @param stripLocalizationMarkers True if all Localization markers ('T$') should be removed.
 */
function resolveJsonRefs(filename: string, stripLocalizationMarkers: boolean): any {
  try {
    const content = JSON.parse(fs.readFileSync(filename));
    return processNode(dirname(filename), content, stripLocalizationMarkers);
  } catch (e) {
    if (e instanceof SyntaxError) {
      reportSyntaxError(filename, e);
    } else {
      console.error(`Caught an error in ${filename}: ` + e);
    }
  }
}

function processNode(directory: string, node: any, stripLocalizationMarkers: boolean): any {
  if (_.isArray(node)) {
    return processArray(directory, node, stripLocalizationMarkers);
  } else if (_.isObject(node)) {
    return processObject(directory, node, stripLocalizationMarkers);
  }
  return node;
}

function processObject(directory: string, node: any, stripLocalizationMarkers: boolean): any {
  if (_.has(node, '$ref')) {
    return processReference(directory, node, stripLocalizationMarkers);
  } else {
    const object: any = {};
    _.forEach(node, function(value: any, key: any) {
      // handle localizable properties
      if (stripLocalizationMarkers && _.isString(key)) {
        key = key.replace(/t\$|T\$/g, '');
      }
      object[key] = processNode(directory, value, stripLocalizationMarkers);
    });

    return object;
  }
}

function processReference(directory: string, node: any, stripLocalizationMarkers: boolean): any {
  const value = <string>_.get(node, '$ref');
  const parts = _.split(value, ':');
  const referredPath = join(directory, ..._.initial(parts), _.last(parts) + '.json');
  return resolveJsonRefs(referredPath, stripLocalizationMarkers);
}

function processArray(directory: string, node: any, stripLocalizationMarkers: boolean): any {
  const arrayNode: any = [];
  _.forEach(node, function(child: any) {
    arrayNode.push(processNode(directory, child, stripLocalizationMarkers));
  });
  return arrayNode;
}

function reportSyntaxError(filename: string, e: SyntaxError) {
  try {
    jsonlint.parse(fs.readFileSync(filename, 'utf8'));
  } catch (e) {
    console.error(chalk.white.bgRed.bold('--------------------------------------------'));
    console.error(chalk.white.bgRed.bold(`Syntax Error in ${filename}`));
    console.error(chalk.white.bgRed.bold(e));
    console.error(chalk.white.bgRed.bold('--------------------------------------------'));
  }
}

export function validate(application: any, schema:string): void {
  const ajv = new ajvmodule();
  const validator = ajv.compile(loadSchema(schema));
  const validation = validator(application);
  if (validation === true) {
    log(chalk.green('Application conforms to the schema'));
  } else {
    log(`There were ${chalk.red('errors')} validating the application against the schema:`);
    // pretty printing the error object
    for (const err of validator.errors) {
      log(chalk.red(`- ${err.dataPath || '.'} ${err.message}`));
    }
    //process.exit(1);
  }

}

/**
 * Loads and parses the generated schema.
 * @returns {object} the schema
 */
function loadSchema(path:string): any {
  let schemaPath = getSchema(path);
  const schemaFileHandle = fs.readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaFileHandle);
  log(`Loaded schema from ${chalk.green(schemaPath)}`);
  return schema;
}
