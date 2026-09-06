import { beforeEach, describe, expect, it } from 'vitest';
import { activateTab, closeTab, openTab, tabsNow } from './tabs.ts';

const note = (id: number) => ({ id, title: `note ${String(id)}` });
const ids = () => tabsNow().tabs.map((tab) => tab.id);

describe('the tab strip', () => {
  beforeEach(() => {
    for (const tab of [...tabsNow().tabs]) closeTab(tab.id);
    expect(ids()).toEqual([]);
  });

  it('keeps every note that is opened', () => {
    openTab(note(1));
    openTab(note(2));
    openTab(note(3));

    expect(ids()).toEqual([1, 2, 3]);
    expect(tabsNow().active).toBe(3);
  });

  it('moves to a note that is already open instead of opening it twice', () => {
    openTab(note(1));
    openTab(note(2));
    openTab(note(1));

    expect(ids()).toEqual([1, 2]);
    expect(tabsNow().active).toBe(1);
  });

  it('opens in the background without leaving where you are', () => {
    openTab(note(1));
    openTab(note(2), { background: true });

    expect(ids()).toEqual([1, 2]);
    expect(tabsNow().active).toBe(1);
  });

  it('lands on a neighbour when the open one is closed', () => {
    openTab(note(1));
    openTab(note(2));
    openTab(note(3));
    activateTab(2);
    closeTab(2);

    expect(ids()).toEqual([1, 3]);
    expect(tabsNow().active).toBe(3);
  });

  it('has nothing active once the last tab is closed', () => {
    openTab(note(1));
    closeTab(1);

    expect(ids()).toEqual([]);
    expect(tabsNow().active).toBeNull();
  });
});
