import { theme as antdTheme } from 'antd';
import { DARK, LIGHT, SHAPE } from './tokens';

/**
 * Maps our brand tokens onto Ant Design's token system.
 * `mode` is the resolved mode ('light' | 'dark'), never 'system'.
 */
export function buildTheme(mode) {
  const t = mode === 'dark' ? DARK : LIGHT;

  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    // Scores of components across this panel read theme colours as
    // `var(--ant-color-*)` (fill tints, semantic backgrounds, accent
    // borders) rather than importing tokens directly. Ant Design only
    // publishes those custom properties when its CSS-variables mode is on —
    // without this, every one of those `var()` calls silently resolves to
    // nothing, which is why large parts of the panel read flatter and more
    // colourless than the token values in this file actually specify.
    cssVar: true,
    hashed: false,
    token: {
      ...SHAPE,
      colorPrimary: t.colorPrimary,
      colorSuccess: t.colorSuccess,
      colorWarning: t.colorWarning,
      colorError: t.colorError,
      colorInfo: t.colorInfo,
      colorText: t.colorText,
      colorTextSecondary: t.colorTextSecondary,
      colorTextTertiary: t.colorTextTertiary,
      colorBgLayout: t.colorBgLayout,
      colorBgContainer: t.colorBgContainer,
      colorBgElevated: t.colorBgElevated,
      colorBorder: t.colorBorder,
      colorBorderSecondary: t.colorBorderSecondary,
      colorLink: t.colorPrimary,
      colorLinkHover: t.colorPrimaryHover,
      boxShadowTertiary:
        mode === 'dark'
          ? '0 1px 2px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.30)'
          : '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)',
    },
    components: {
      Layout: {
        headerBg: t.colorHeaderBg,
        headerHeight: 56,
        headerPadding: '0 16px',
        bodyBg: t.colorBgLayout,
        siderBg: t.colorSiderBg,
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        darkItemColor: t.colorSiderText,
        darkItemSelectedBg: t.colorSiderItemActiveBg,
        darkItemSelectedColor: t.colorSiderTextActive,
        darkItemHoverBg: 'rgba(255,255,255,0.06)',
        itemHeight: 38,
        itemMarginInline: 8,
        iconMarginInlineEnd: 10,
      },
      Table: {
        headerBg: mode === 'dark' ? '#1C2027' : '#FAFAFA',
        headerColor: t.colorTextSecondary,
        headerSplitColor: 'transparent',
        rowHoverBg: mode === 'dark' ? '#1F242C' : '#F7F9FC',
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
        borderColor: t.colorBorderSecondary,
        // Money and IDs line up column-wise only with tabular figures.
        fontVariantNumeric: 'tabular-nums',
      },
      // A plain bordered Card otherwise uses `colorBorderSecondary`, which is
      // nearly invisible against the page background — every card on every
      // screen reads noticeably more defined with the stronger border.
      Card: { paddingLG: 16, colorBorderSecondary: t.colorBorder },
      Descriptions: { itemPaddingBottom: 10, labelColor: t.colorTextSecondary },
      Tag: { defaultBg: t.colorFillQuaternary },
      Statistic: { contentFontSize: 24 },
      Form: { labelColor: t.colorTextSecondary, verticalLabelPadding: '0 0 4px' },
      Tabs: { horizontalItemPadding: '10px 0', horizontalItemGutter: 24 },
      Drawer: { paddingLG: 16 },
      Modal: { paddingContentHorizontalLG: 20 },
      Segmented: { itemSelectedBg: t.colorPrimaryBg, itemSelectedColor: t.colorPrimary },
      Button: { fontWeight: 500, primaryShadow: 'none' },
      Breadcrumb: { itemColor: t.colorTextSecondary, lastItemColor: t.colorText },
    },
  };
}
