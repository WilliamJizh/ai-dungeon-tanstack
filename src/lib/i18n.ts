export type Locale = 'en' | 'zh-CN';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    continue_hint: 'SPACE / CLICK TO CONTINUE',
    check_label: 'CHECK',
    dc_label: 'DC',
    result_label: 'RESULT',
    success: 'SUCCESS',
    failure: 'FAILURE',
    inventory_title: '[ INVENTORY ]',
    inventory_empty: 'INVENTORY EMPTY',
    equipped: 'EQ',
    close_hint: '[ ESC / CLICK ]  CLOSE',
    select_item: 'SELECT',
    navigate_hint: '[↑↓←→]  NAVIGATE    [ENTER]  SELECT',
    map_title: '[ WORLD MAP ]',
    map_title_region: '[ REGION MAP ]',
    map_title_area: '[ AREA MAP ]',
    select_destination: 'SELECT A DESTINATION',
    close_map: '[ ESC ]  CLOSE MAP',
    retreat: '[ESC]  RETREAT',
    round_label: 'ROUND',
    dm_thinking: 'DM',
    scene_start: '[scene start]',
  },
  'zh-CN': {
    continue_hint: '按空格 / 点击继续',
    check_label: '检定',
    dc_label: '难度',
    result_label: '结果',
    success: '成功',
    failure: '失败',
    inventory_title: '[ 物品栏 ]',
    inventory_empty: '背包为空',
    equipped: '装备',
    close_hint: '[ ESC / 点击 ]  关闭',
    select_item: '选择',
    navigate_hint: '[↑↓←→]  导航    [回车]  确认',
    map_title: '[ 世界地图 ]',
    map_title_region: '[ 区域地图 ]',
    map_title_area: '[ 地区地图 ]',
    select_destination: '选择目的地',
    close_map: '[ ESC ]  关闭地图',
    retreat: '[ESC]  撤退',
    round_label: '回合',
    dm_thinking: 'DM',
    scene_start: '[scene start]',
  },
};

export function t(key: string, locale: Locale = 'en'): string {
  return translations[locale]?.[key] ?? translations['en'][key] ?? key;
}
