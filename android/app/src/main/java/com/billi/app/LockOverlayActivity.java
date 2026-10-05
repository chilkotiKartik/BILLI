package com.billi.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class LockOverlayActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.parseColor("#120E1E"));
        layout.setPadding(48, 48, 48, 48);

        // Cat Emoji / Avatar
        TextView catIcon = new TextView(this);
        catIcon.setText("🐱");
        catIcon.setTextSize(72);
        catIcon.setGravity(Gravity.CENTER);
        layout.addView(catIcon);

        // Title
        TextView title = new TextView(this);
        title.setText("Billi Study Lock");
        title.setTextSize(26);
        title.setTextColor(Color.parseColor("#FF8A1F"));
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 24, 0, 12);
        layout.addView(title);

        // Subtitle
        TextView desc = new TextView(this);
        desc.setText("This app is locked during your active study session.\nStay focused on your GATE goals!");
        desc.setTextSize(16);
        desc.setTextColor(Color.parseColor("#E2DDF2"));
        desc.setGravity(Gravity.CENTER);
        desc.setPadding(0, 0, 0, 48);
        layout.addView(desc);

        // Return to Billi Button
        Button backBtn = new Button(this);
        backBtn.setText("Return to Study Timer");
        backBtn.setTextColor(Color.WHITE);
        backBtn.setBackgroundColor(Color.parseColor("#7A3EED"));
        backBtn.setPadding(32, 20, 32, 20);
        backBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(LockOverlayActivity.this, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(intent);
                finish();
            }
        });
        layout.addView(backBtn);

        setContentView(layout);
    }

    @Override
    public void onBackPressed() {
        // Go home to prevent bypassing
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(homeIntent);
        finish();
    }
}
