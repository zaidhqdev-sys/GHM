function unsupportedParser(name) {
  return function workerBodyParserMustBeInjected(_options) {
    return function rejectUnexpectedBodyParser(_request, _response, next) {
      next(new Error(`Express body-parser ${name} is disabled in the Cloudflare Worker; inject jsonBodyParser`));
    };
  };
}

module.exports = {
  json: unsupportedParser('json'),
  raw: unsupportedParser('raw'),
  text: unsupportedParser('text'),
  urlencoded: unsupportedParser('urlencoded'),
};
