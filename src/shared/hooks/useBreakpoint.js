import { Grid } from 'antd';

/**
 * Named breakpoints matching the responsive rules in plan §8.2, so components
 * express intent ("isMobile") rather than repeating raw screen queries.
 */
export default function useBreakpoint() {
  const screens = Grid.useBreakpoint();

  const isMobile = !screens.md; // < 768
  const isTablet = Boolean(screens.md) && !screens.lg; // 768–991
  const isDesktop = Boolean(screens.lg); // >= 992
  const isWide = Boolean(screens.xxl); // >= 1600

  return {
    screens,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    /** Columns hidden below `lg` are the ones marked low priority in tables. */
    columnPriorityCutoff: isMobile ? 1 : isTablet ? 2 : 3,
  };
}
