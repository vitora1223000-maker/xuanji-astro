/*
 * chiron-helper.js
 * 为「星象.html」补充凯龙星(Chiron)黄道经度计算。
 * 依赖: ephemeris.bundle.js (Moshier-Ephemeris-JS, UMD 版, 纯本地, 不联网)。
 *
 * 加载顺序(在 星象.html 里):
 *   <script src="./ephemeris.bundle.js"></script>   <!-- 必须在前 -->
 *   <script src="./chiron-helper.js"></script>      <!-- 再加这个 -->
 *
 * 之后即可调用:  window.chironLon(utcDate)
 *   入参 : JS Date 对象(代表 UTC 时刻; 与 astronomy.js 的 GeoVector 用法一致, 都吃 Date)
 *   出参 : 凯龙星地心黄道经度(0~360 度, Number)
 *
 * 用法示例(与现有 lon(b,date) 对齐, 直接拿来塞进 BODIES/pos):
 *   const L = chironLon(new Date(Date.UTC(1994,6,24,5,35)));  // -> 159.5  处女座9°
 */
(function (root) {
  'use strict';

  // UMD 包在 <script src> 下会把对象挂到 window.Ephemeris
  function getEphemerisCtor() {
    var E = root.Ephemeris;
    if (!E) throw new Error('[chiron-helper] 未找到 Ephemeris, 请先加载 ephemeris.bundle.js');
    // UMD 默认导出在 .default 上
    return E.default || E;
  }

  /**
   * 给定一个 UTC 时刻的 JS Date, 返回凯龙星地心黄道经度(0~360)。
   * @param {Date} utcDate - 代表 UTC 时刻的 Date 对象
   * @returns {number} 黄经(度), 范围 [0,360)
   */
  function chironLon(utcDate) {
    if (!(utcDate instanceof Date) || isNaN(utcDate.getTime())) {
      throw new Error('[chiron-helper] chironLon 需要一个有效的 Date 对象');
    }
    var Ephemeris = getEphemerisCtor();

    // Moshier 库的入参按 UTC 拆解; 月份是 0~11(0=一月), 与 JS getUTCMonth 一致。
    var eph = new Ephemeris({
      key: 'chiron',
      year:    utcDate.getUTCFullYear(),
      month:   utcDate.getUTCMonth(),      // 0~11
      day:     utcDate.getUTCDate(),
      hours:   utcDate.getUTCHours(),
      minutes: utcDate.getUTCMinutes(),
      seconds: utcDate.getUTCSeconds(),
      latitude: 0,            // 地心黄经与观测地无关, 用 0/0 即可
      longitude: 0,
      calculateMotion: false, // 只要位置, 关掉逆行/运动计算, 提速
      calculateShadows: false
    });

    var L = eph.chiron.position.apparentLongitude; // 地心视黄经(度)
    L = L % 360;
    if (L < 0) L += 360;
    return L;
  }

  root.chironLon = chironLon;
})(typeof window !== 'undefined' ? window : this);
