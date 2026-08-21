import { openDb } from '@memex/db';
import { CONFIG_DIR, expandPath, loadConfig, type TagVariant } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { applyRenames, planTidy, renameMap } from '../services/tidy.ts';

const list = (variants: TagVariant[]) => {
  for (const v of variants.slice(0, 15)) {
    const from = v.drop.map((d) => `${d.tag}(${d.count})`).join(', ');
    console.log(`  ${pc.bold(v.keep)} ${pc.dim('<-')} ${from}`);
  }
  if (variants.length > 15) console.log(pc.dim(`  ... 외 ${variants.length - 15}쌍`));
};

export const registerTagsTidy = (tags: Command) => {
  tags
    .command('tidy')
    .description('Fold tags that differ only in spelling — proposes first, applies only when told')
    .option('--apply', 'Rewrite the notes instead of only listing the proposal')
    .action((opts: { apply?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      const { ours, external, mine, externalRoots } = planTidy(
        client,
        expandPath(loadConfig().vault_path),
      );

      if (ours.length === 0 && external.length === 0) {
        console.log(`${pc.green('OK')} 표기가 갈린 태그는 없어.`);
        return;
      }

      console.log();
      if (ours.length > 0) {
        console.log(
          pc.bold(`표기만 다른 태그 ${ours.length}쌍`) + pc.dim(` · 노트 ${mine.length}개`),
        );
        console.log();
        list(ours);
        console.log();
      } else {
        console.log(`${pc.green('OK')} 볼트 안에서 고칠 태그는 없어.`);
        console.log();
      }

      if (external.length > 0) {
        console.log(
          pc.dim(
            `${external.length}쌍은 볼트 밖 원본 태그라 건너뛰어 — 고치려면 거기서 고쳐야 해.`,
          ),
        );
        for (const root of externalRoots.slice(0, 5)) console.log(pc.dim(`    ${root}`));
        console.log();
      }

      if (ours.length === 0) return;

      if (!opts.apply) {
        console.log(pc.dim('제안만 했어. 적용은 `memex tags tidy --apply`'));
        console.log(
          pc.dim(
            '번역쌍(toss/토스)은 여기 없어 — 같은 말인지는 계산이 아니라 판단이라 Claude에게 물어봐.',
          ),
        );
        return;
      }

      const applied = applyRenames(client, renameMap(ours), mine);
      console.log(
        `${pc.green('OK')} 노트 ${applied.notes}개 정리 ${pc.dim(`(파일 ${applied.files}개 수정)`)}`,
      );

      if (applied.unwritten.length > 0) {
        console.log();
        console.log(
          pc.yellow(`! ${applied.unwritten.length}개는 파일에 tags가 없어 색인만 고쳤어`) +
            pc.dim(' — 다시 index하면 되돌아가.'),
        );
        for (const line of applied.unwritten.slice(0, 10)) console.log(pc.dim(`    ${line}`));
      }
    });
};
