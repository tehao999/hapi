import packageJson from '../../package.json'
import { getCliArgs } from '@/utils/cliArgs'

export async function runCli(): Promise<void> {
    const args = getCliArgs()

    if (args.includes('-v') || args.includes('--version')) {
        console.log(`hapi version: ${packageJson.version}`)
        process.exit(0)
    }

    if (args[0] === 'doctor' && args[1] === 'storage') {
        const { doctorCommand } = await import('./doctor')
        await doctorCommand.run({
            args,
            subcommand: 'doctor',
            commandArgs: args.slice(1)
        })
        return
    }

    const { isBunCompiled } = await import('@/projectPath')
    if (isBunCompiled()) {
        process.env.DEV = 'false'
    }

    const { resolveCommand } = await import('./registry')
    const { command, context } = resolveCommand(args)

    if (command.requiresRuntimeAssets) {
        const { ensureRuntimeAssets } = await import('@/runtime/assets')
        const { logger } = await import('@/ui/logger')
        await ensureRuntimeAssets()
        logger.debug('Starting hapi CLI with args: ', process.argv)
    }

    await command.run(context)
}
