package config

import (
	"errors"
	"os"
	"strings"
)

type TelegramConfig struct {
	BotToken string
	ChatID   string
}

type AWSConfig struct {
	EventBusName string
}

func GetEnv(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

func RequireEnv(key string) (string, error) {
	v := GetEnv(key)
	if v == "" {
		return "", errors.New("missing env: " + key)
	}
	return v, nil
}

func LoadTelegramConfig() (TelegramConfig, error) {
	token, err := RequireEnv("TELEGRAM_BOT_TOKEN")
	if err != nil {
		return TelegramConfig{}, err
	}
	chat, err := RequireEnv("TELEGRAM_CHAT_ID")
	if err != nil {
		return TelegramConfig{}, err
	}
	return TelegramConfig{BotToken: token, ChatID: chat}, nil
}

