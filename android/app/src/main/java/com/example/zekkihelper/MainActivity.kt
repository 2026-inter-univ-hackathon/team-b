package com.example.zekkihelper

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.zekkihelper.ui.theme.ZekkiHelperTheme

// アプリのメインカラー定義
val DarkBlueBg = Color(0xFF141933)
val CardBg = Color(0xFF1F2445)
val AccentOrange = Color(0xFFFF9800)
val TextLight = Color(0xFFE0E0E0)
val GridColor = Color(0xFF2A2F50)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ZekkiHelperTheme {
                // 背景を方眼紙風に描画するカスタムモディファイア
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(DarkBlueBg)
                        .drawBehind {
                            val gridSize = 40.dp.toPx()
                            val width = size.width
                            val height = size.height

                            // 縦線
                            for (x in 0..width.toInt() step gridSize.toInt()) {
                                drawLine(GridColor, Offset(x.toFloat(), 0f), Offset(x.toFloat(), height), 1f)
                            }
                            // 横線
                            for (y in 0..height.toInt() step gridSize.toInt()) {
                                drawLine(GridColor, Offset(0f, y.toFloat()), Offset(width, y.toFloat()), 1f)
                            }
                        }
                ) {
                    MainScreen()
                }
            }
        }
    }
}

@Composable
fun MainScreen() {
    // 0: アラーム, 1: 終電アラート (警告対応のため mutableIntStateOf を使用)
    var selectedTabIndex by remember { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // ヘッダー
        Text("ZEKKI HELPER", color = TextLight, fontSize = 12.sp, letterSpacing = 2.sp)
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Zekki ヘルパー", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.width(8.dp))
            Box(modifier = Modifier.width(20.dp).height(4.dp).background(AccentOrange))
        }
        Text("問題を解いて、二度寝を防ぐ目覚まし。", color = TextLight, fontSize = 14.sp)

        Spacer(modifier = Modifier.height(24.dp))

        // タブ切り替え（アラーム / 終電アラート）
        Row(modifier = Modifier.fillMaxWidth()) {
            TabButton(
                text = "アラーム",
                isSelected = selectedTabIndex == 0,
                modifier = Modifier.weight(1f),
                onClick = { selectedTabIndex = 0 }
            )
            TabButton(
                text = "終電アラート",
                isSelected = selectedTabIndex == 1,
                modifier = Modifier.weight(1f),
                onClick = { selectedTabIndex = 1 }
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        // 選択されたタブに応じて中身を切り替え
        if (selectedTabIndex == 0) {
            AlarmSettingContent()
        } else {
            LastTrainAlertContent()
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

// ---------------------------------------------------
// アラーム設定画面のコンテンツ
// ---------------------------------------------------
@Composable
fun AlarmSettingContent() {
    // --- 状態（State）の定義 ---
    var isAm by remember { mutableStateOf(true) } // 午前ならtrue、午後ならfalse
    var selectedGenres by remember { mutableStateOf(setOf("文字・記号")) } // 複数選択できるのでSetを使用
    var difficulty by remember { mutableStateOf("ふつう") } // 単一選択なのでString
    var sound by remember { mutableStateOf("ビープ") } // 単一選択なのでString

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {

            // 次のアラーム表示
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("次のアラーム", color = TextLight, fontWeight = FontWeight.Bold)
                Text("未セット", color = TextLight, fontSize = 12.sp)
            }
            Text("07:30", color = Color.White, fontSize = 64.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp)

            // 選択されている状態をテキストにも反映
            val genreText = if (selectedGenres.isEmpty()) "全ジャンル" else selectedGenres.joinToString("・")
            Text("1回だけ\n$genreText / $difficulty / $sound", color = TextLight, fontSize = 14.sp)

            Spacer(modifier = Modifier.height(24.dp))
            HorizontalDivider(color = GridColor)
            Spacer(modifier = Modifier.height(24.dp))

            // 繰り返し設定 (モック)
            SettingSectionTitle("繰り返し")
            OutlinedButton(
                onClick = { /* TODO: 繰り返し選択ダイアログ */ },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                border = borderStroke()
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("1回だけ")
                    Text("∨")
                }
            }
            SettingDescription("繰り返しは、正解して止めると次回を自動セットします。音を鳴らすには画面を開いたままにしてください。")

            Spacer(modifier = Modifier.height(24.dp))

            // 鳴らす時刻 (午前/午後 トグル)
            SettingSectionTitle("鳴らす時刻")
            Row(modifier = Modifier.fillMaxWidth()) {
                TabButton("午前", isSelected = isAm, modifier = Modifier.weight(1f)) { isAm = true }
                TabButton("午後", isSelected = !isAm, modifier = Modifier.weight(1f)) { isAm = false }
            }
            Spacer(modifier = Modifier.height(8.dp))

            // 時・分の入力 (モック)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                TimeDropdown("時", "7", modifier = Modifier.weight(1f))
                Text(":", color = Color.White, fontSize = 32.sp, modifier = Modifier.align(Alignment.CenterVertically))
                TimeDropdown("分", "30", modifier = Modifier.weight(1f))
            }

            Spacer(modifier = Modifier.height(32.dp))

            // 出題ジャンル (複数選択機能)
            SettingSectionTitle("出題ジャンル")
            SettingDescription("数学が苦手なら「文字・記号」だけでも使えます。未選択の場合は全ジャンルから出題します。")
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val genres = listOf("文字・記号", "数学", "物理")
                genres.forEach { genre ->
                    CheckboxItem(
                        text = genre,
                        isChecked = selectedGenres.contains(genre),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            selectedGenres = if (selectedGenres.contains(genre)) {
                                selectedGenres - genre
                            } else {
                                selectedGenres + genre
                            }
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // 難易度 (単一選択機能)
            SettingSectionTitle("難易度")
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val difficulties = listOf("やさしい", "ふつう", "むずかしい")
                difficulties.forEach { diff ->
                    RadioItem(
                        text = diff,
                        isSelected = difficulty == diff,
                        modifier = Modifier.weight(1f),
                        onClick = { difficulty = diff }
                    )
                }
            }
            SettingDescription("ふつう：文字列を長くし、計算は複数の項・手順を使います。\n\n苦手な問題を優先し、4問ごとに1問は一段やさしい問題を出します。\n\n5分正解できなければ一段やさしくします（ログに残ります）")

            Spacer(modifier = Modifier.height(32.dp))

            // 音 (単一選択機能)
            SettingSectionTitle("音")
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val sounds = listOf("ビープ", "サイレン")
                sounds.forEach { s ->
                    RadioItem(
                        text = s,
                        isSelected = sound == s,
                        modifier = Modifier.weight(1f),
                        onClick = { sound = s }
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(
                onClick = { /* TODO: 音を鳴らす処理 */ },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                border = borderStroke()
            ) {
                Text("試聴（2秒）")
            }

            Spacer(modifier = Modifier.height(24.dp))
            SettingDescription("小さな音から始まり、30秒ごとに指定した上限まで上がります。試聴は上限の音量です。端末本体の音量も確認してください。")

            Spacer(modifier = Modifier.height(32.dp))

            // セットボタン
            Button(
                onClick = { /* TODO: アラームセット処理 */ },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("この時刻にセットする", color = Color.Black, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ---------------------------------------------------
// 終電アラート画面のコンテンツ
// ---------------------------------------------------
@Composable
fun LastTrainAlertContent() {
    var departureStation by remember { mutableStateOf("") }
    var arrivalStation by remember { mutableStateOf("") }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {

            // ヘッダー部分
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("終電アラート", color = TextLight, fontWeight = FontWeight.Bold)
                Text("未セット", color = TextLight, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(16.dp))
            Text("帰る時間を決める", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)

            SettingDescription("乗り換えは最大2回。提供されている時刻表から検索します。")
            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider(color = GridColor)
            Spacer(modifier = Modifier.height(16.dp))

            SettingDescription("自宅の最寄り駅以外にいるとき、そこから帰る終電を調べて、出発すべき時刻の少し前に知らせます。")
            Spacer(modifier = Modifier.height(24.dp))

            // 出発駅入力
            SettingSectionTitle("出発：今いる駅")
            OutlinedTextField(
                value = departureStation,
                onValueChange = { departureStation = it },
                placeholder = { Text("例: 新宿", color = Color.Gray) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                // Material 3の最新の書き方に修正
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AccentOrange,
                    unfocusedBorderColor = GridColor,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent
                ),
                shape = RoundedCornerShape(8.dp)
            )
            SettingDescription("空欄なら現在地から探します。")

            // 下矢印アイコン (標準アイコンに変更)
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Filled.KeyboardArrowDown,
                    contentDescription = "To",
                    tint = AccentOrange,
                    modifier = Modifier.size(32.dp)
                )
            }

            // 到着駅入力
            SettingSectionTitle("到着：自宅の最寄り駅")
            OutlinedTextField(
                value = arrivalStation,
                onValueChange = { arrivalStation = it },
                placeholder = { Text("例: 調布", color = Color.Gray) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AccentOrange,
                    unfocusedBorderColor = GridColor,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent
                ),
                shape = RoundedCornerShape(8.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            // 通知タイミングのドロップダウンモック
            SettingSectionTitle("列車の発車の何分前に知らせるか")
            OutlinedButton(
                onClick = { /* TODO: 選択リスト表示 */ },
                modifier = Modifier
                    .width(160.dp)
                    .height(56.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                border = borderStroke()
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("15 分前", fontSize = 16.sp)
                    Text("∨")
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // セットボタン
            Button(
                onClick = { /* TODO: API検索とアラームセット処理 */ },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("終電を調べてセット", color = Color.Black, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ---------------------------------------------------
// 共通UIコンポーネント群
// ---------------------------------------------------
@Composable
fun TabButton(text: String, isSelected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) AccentOrange else Color.Transparent,
            contentColor = if (isSelected) Color.Black else TextLight
        ),
        shape = RoundedCornerShape(4.dp),
        border = if (!isSelected) borderStroke() else null
    ) {
        Text(text, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun SettingSectionTitle(title: String) {
    Text(title, color = TextLight, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
fun SettingDescription(text: String) {
    Spacer(modifier = Modifier.height(8.dp))
    Text(text, color = Color.Gray, fontSize = 12.sp, lineHeight = 18.sp)
}

@Composable
fun TimeDropdown(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(label, color = TextLight, fontSize = 12.sp)
        OutlinedButton(
            onClick = { /* TODO */ },
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
            border = borderStroke()
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(value, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                Text("∨")
            }
        }
    }
}

@Composable
fun CheckboxItem(text: String, isChecked: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
        border = borderStroke(if (isChecked) AccentOrange else GridColor),
        contentPadding = PaddingValues(8.dp)
    ) {
        Text(text, fontSize = 12.sp, color = if (isChecked) Color.White else TextLight)
    }
}

@Composable
fun RadioItem(text: String, isSelected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
        border = borderStroke(if (isSelected) AccentOrange else GridColor),
        contentPadding = PaddingValues(8.dp)
    ) {
        Text(text, fontSize = 12.sp, color = if (isSelected) Color.White else TextLight)
    }
}

fun borderStroke(color: Color = GridColor) = BorderStroke(1.dp, color)