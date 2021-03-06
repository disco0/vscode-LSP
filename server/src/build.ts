import log = require('fancy-log');
import {join, dirname, normalize, basename} from "path";
import * as _ from 'lodash';
import * as fs from 'fs';

function getFiles(dir:string, fileList:string[], fileName:string){
  fileList = fileList || [];
  var files = fs.readdirSync(dir);
  for(var i in files){
      if (!files.hasOwnProperty(i)) {continue;}
      var name = normalize(dir+'/'+files[i]);
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

export function hasSchema(dir:string){
  while(basename(dir)!=="Application" && dir!==dirname(dir)){
    dir = dirname(dir);
  }
  if (dir ===dirname(dir)){
    return false;
  }
  let root = dirname(dir);

  let schemaPath = normalize(join(root, "Tools", "core", "dist", "dev", "web"));
  let schemaArray = getFiles(schemaPath,[], "schema.json");
  let len = schemaArray.length;
  if(len<1){
    log('No schemas found in workspace');
    return false;
  }  else if(len>1){
    log('More than 1 schema found in workspace');
    return false;
  } else {
    return true;
  }
}

function getSchema(dir:string){
  while(basename(dir)!=="Application" && dir!==dirname(dir)){
    dir=dirname(dir);
  }
  let root = dirname(dir);

  let schemaPath = normalize(join(root, "tools", "core", "dist", "dev", "web"));
  let schemaArray = getFiles(schemaPath,[], "schema.json");
  let len = schemaArray.length;
  if(len<1){
    log('No schemas found in workspace');
  }  else if(len>1){
    log('More than 1 schema found in workspace');
  }
  return schemaArray[0];
}


function getApplication(dir:string){
  while((basename(dir).length!==2 && basename(dir)!=="base") && basename(dir)!=="testFixture" && dir!==dirname(dir)){
    dir=dirname(dir);
  }
  if (dir===dirname(dir)){
    return null;
  }
  let applicationArray = getFiles(dir,[], "application.json");
  let len = applicationArray.length;
  if(len<1){
    log('No applications found in workspace');
  }  else if(len>1){
    log('More than 1 application found in workspace');
  }
  return applicationArray[0];
}


export async function buildApplicationSource(dirPath: string) {
    const applicationJsonPath = getApplication(dirPath);
    if (!applicationJsonPath){
      return null;
    }
    const application = doLoadApplication(applicationJsonPath);
    return application;
}
  
function doLoadApplication(applicationJsonPath: string): any /* IApplicationConfiguration */ {
    const application = resolveJsonRefs(applicationJsonPath, true);
    application['terms'] = {};
    log(`Loaded application from ${applicationJsonPath}`);
    return application;
}

/**
 * Loads a file with the given filename and resolves all JSON references recursively.
 * @param filename a JSON file
 * @param stripLocalizationMarkers True if all Localization markers ('T$') should be removed.
 */
function resolveJsonRefs(filename: string, stripLocalizationMarkers: boolean): any {
  try {
    const content = JSON.parse(fs.readFileSync(filename, 'utf8'));
    return processNode(dirname(filename), content, stripLocalizationMarkers);
  } catch (e) {
    if (e instanceof SyntaxError) {
      reportSyntaxError(filename, e);
    } else {
      log(`Caught an error in ${filename}: ` + e);
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
    JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (e) {
    log('--------------------------------------------');
    log(`Syntax Error in ${filename}`);
    log(e);
    log('--------------------------------------------');
  }
}

/**
 * Loads and parses the generated schema.
 * @returns {object} the schema
 */
export function loadSchema(path:string): any {
  let schemaPath = normalize(getSchema(path));
  let schemaFileHandle = fs.readFileSync(schemaPath, 'utf-8');
  let schema = JSON.parse(schemaFileHandle);
  log(`Loaded schema from ${schemaPath}`);
  return schema;
}