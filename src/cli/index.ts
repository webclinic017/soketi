import { Cli } from './cli';

let yargs = require('yargs')
    .usage('Usage: soketi <command> [options]')
    .command('start', 'Start the server.', yargs => Cli.start(yargs))
    .demandCommand(1, 'Please provide a valid command.')
    .help('help')
    .alias('help', 'h');

yargs.$0 = '';

let argv = yargs.argv;
