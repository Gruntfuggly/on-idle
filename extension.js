var vscode = require( 'vscode' );
var path = require( 'path' );

var timer;
var button;
var lastVersion;
var maxStackSize = 999;
var versions = { stack: [], position: -1 };

function activate( context )
{
    function hash( text )
    {
        var hash = 0;
        if( text.length === 0 )
        {
            return hash;
        }
        for( var i = 0; i < text.length; i++ )
        {
            var char = text.charCodeAt( i );
            hash = ( ( hash << 5 ) - hash ) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return hash;
    }

    function doCommands()
    {
        function doNextCommand()
        {
            if( extensionConfig.commands.length > 0 )
            {
                var command = extensionConfig.commands.shift();
                vscode.commands.executeCommand( command ).then( doNextCommand );
            }
        }

        timer = undefined;

        var extension = getExtension();
        var extensionConfig = vscode.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} )[ extension ];

        if( extensionConfig && extensionConfig.enabled === true )
        {
            doNextCommand();
        }
    }

    function getExtension()
    {
        var editor = vscode.window.activeTextEditor;
        if( editor && editor.document )
        {
            ext = path.extname( editor.document.fileName );
            if( ext && ext.length > 1 )
            {
                return ext.substr( 1 );
            }
        }
        return "";
    }

    function isEnabled()
    {
        var extension = getExtension();
        var commands = vscode.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} )[ extension ];
        return commands && commands.enabled;
    }

    function triggerCommands()
    {
        var delay = parseInt( vscode.workspace.getConfiguration( 'onIdle' ).get( 'delay' ) );

        clearTimeout( timer );
        timer = undefined;

        if( isEnabled() && delay > 0 )
        {
            var editor = vscode.window.activeTextEditor;
            var version = editor.document.version;

            if( !lastVersion || version > lastVersion )
            {
                timer = setTimeout( doCommands, delay );
            }
        }
    }

    function updateButton()
    {
        var extension = getExtension();

        var enabled = isEnabled() === true;

        button.text = "$(" + vscode.workspace.getConfiguration( 'onIdle' ).get( 'buttonIcon' ) + ") $(" + ( enabled ? "check" : "x" ) + ")";
        button.command = 'onIdle.' + ( enabled ? 'disable' : 'enable' );
        button.tooltip = ( enabled ? 'Disable' : 'Enable' ) + " On Idle for ." + extension + " files";

        var extension = getExtension();
        var commands = vscode.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} )[ extension ];

        if( commands && commands && commands.commands.length > 0 )
        {
            button.show();
        }
        else
        {
            button.hide();
        }
    }

    function createButton()
    {
        if( button )
        {
            button.dispose();
        }

        button = vscode.window.createStatusBarItem(
            vscode.workspace.getConfiguration( 'onIdle' ).get( 'buttonAlignment' ) + 1,
            vscode.workspace.getConfiguration( 'onIdle' ).get( 'buttonPriority' ) );

        context.subscriptions.push( button );

        updateButton();
    }

    function configure( shouldEnable )
    {
        versions = { stack: [], position: -1 };
        var extension = getExtension();
        var commands = vscode.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} );
        commands[ extension ].enabled = shouldEnable;
        vscode.workspace.getConfiguration( 'onIdle' ).update( 'commands', commands, true );
    }

    context.subscriptions.push( vscode.workspace.onDidChangeTextDocument( function( editor )
    {
        if( editor && editor.document )
        {
            var currentHash = hash( editor.document.getText() );

            if( versions.stack.length === 0 )
            {
                versions.stack.push( currentHash );
                versions.position = 0;
                triggerCommands();
            }
            else
            {
                var previous = versions.stack.indexOf( currentHash );
                if( previous > -1 )
                {
                    if( previous < versions.position )
                    {
                        versions.position = previous;
                    }
                    else if( previous > versions.position )
                    {
                        versions.position = previous;
                    }
                }
                else
                {
                    versions.stack.splice( versions.position + 1, versions.stack.length - versions.position );
                    versions.stack.push( currentHash );
                    versions.position = versions.stack.length - 1;

                    if( versions.stack.length > maxStackSize )
                    {
                        var previousLength = versions.stack.length;
                        versions.stack = versions.stack.splice( -maxStackSize );
                        versions.position -= ( previousLength - maxStackSize );
                    }

                    triggerCommands();
                }
            }
        }
    } ) );

    context.subscriptions.push( vscode.commands.registerCommand( 'onIdle.enable', function() { configure( true ); } ) );
    context.subscriptions.push( vscode.commands.registerCommand( 'onIdle.disable', function() { configure( false ); } ) );

    context.subscriptions.push( vscode.window.onDidChangeActiveTextEditor( function( e )
    {
        versions = { stack: [], position: -1 };
        clearTimeout( timer );
        timer = undefined;
        updateButton();
        if( e && e.document )
        {
            lastVersion = e.document.version - 1;
        }
    } ) );

    vscode.workspace.onDidOpenTextDocument( function()
    {
        versions = { stack: [], position: -1 };
        if( !button )
        {
            createButton();
        }
        else
        {
            clearTimeout( timer );
            timer = undefined;
            updateButton();
        }
    } );

    context.subscriptions.push( vscode.workspace.onDidChangeConfiguration( function( e )
    {
        if(
            e.affectsConfiguration( 'onIdle.delay' ) ||
            e.affectsConfiguration( 'onIdle.commands' ) )
        {
            triggerCommands();
            updateButton();
        }
        else if(
            e.affectsConfiguration( 'onIdle.buttonIcon' ) ||
            e.affectsConfiguration( 'onIdle.buttonAlignment' ) ||
            e.affectsConfiguration( 'onIdle.buttonPriority' ) )
        {
            createButton();
        }
    } ) );
}

function deactivate()
{
    versions = { stack: [], position: -1 };
    clearTimeout( timer );
    timer = undefined;
}

exports.activate = activate;
exports.deactivate = deactivate;
