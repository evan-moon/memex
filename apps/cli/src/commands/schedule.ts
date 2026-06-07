import type { Command } from 'commander';
import pc from 'picocolors';

// memex never runs a daemon. Periodic work (a daily digest nudge) belongs to the
// OS scheduler — this command just prints a ready-to-use snippet to copy in.
export const registerSchedule = (program: Command) => {
  program
    .command('schedule')
    .description('Print an OS scheduler snippet (cron/launchd) for a periodic digest — no daemon')
    .option('--at <hh:mm>', 'Time of day to run', '09:00')
    .option('--cmd <command>', 'Command to schedule', 'memex digest')
    .action((opts: { at: string; cmd: string }) => {
      const [hh, mm] = opts.at.split(':');
      const hour = Number(hh);
      const minute = Number(mm ?? '0');
      if (
        !Number.isInteger(hour) ||
        hour < 0 ||
        hour > 23 ||
        !Number.isInteger(minute) ||
        minute < 0 ||
        minute > 59
      ) {
        console.error(pc.red(`Invalid --at "${opts.at}". Use HH:MM (24h).`));
        process.exit(1);
      }

      const bin = opts.cmd;
      const log = '~/.memex/digest.log';

      console.log();
      console.log(pc.bold('memex stays a CLI — let the OS schedule it. Pick one:'));
      console.log();
      console.log(pc.bold(pc.cyan('cron (Linux/macOS)')));
      console.log(pc.dim('  run: crontab -e   then add:'));
      console.log(`  ${minute} ${hour} * * * ${bin} >> ${log} 2>&1`);
      console.log();
      console.log(pc.bold(pc.cyan('launchd (macOS, survives reboots)')));
      console.log(pc.dim('  save as ~/Library/LaunchAgents/com.memex.digest.plist then:'));
      console.log(pc.dim('  launchctl load ~/Library/LaunchAgents/com.memex.digest.plist'));
      console.log(
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.memex.digest</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>-c</string><string>${opts.cmd} >> ${log} 2>&1</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
</dict></plist>`,
      );
      console.log();
      console.log(
        pc.dim('Detection is dirty-flagged, so a scheduled digest is cheap when nothing changed.'),
      );
      console.log();
    });
};
