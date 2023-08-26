package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	ckafka "github.com/confluentinc/confluent-kafka-go/kafka"
	_ "github.com/go-sql-driver/mysql"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/salgadoth/driver-tracker/golang/internal/freight/entity"
	"github.com/salgadoth/driver-tracker/golang/internal/freight/infra/repository"
	"github.com/salgadoth/driver-tracker/golang/internal/freight/usecase"
	"github.com/salgadoth/driver-tracker/golang/pkg/kafka"
)

var (
	routesCreated = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "routes_created_total",
			Help: "Total number of created routes",
		},
	)
	routesStarted = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "routes_started_total",
			Help: "Total number of started routes",
		},
		[]string{"status"},
	)
	errorsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "errors_total",
			Help: "Total number of errors",
		},
	)
)

func init() {
	prometheus.MustRegister(routesStarted)
	prometheus.MustRegister(errorsTotal)
	prometheus.MustRegister(routesCreated)
}

func main() {
	db, err := sql.Open("mysql", "root:root@tcp(host.docker.internal:3306)/routes?parseTime=true")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	msgChan := make(chan *ckafka.Message)
	topics := []string{"routes"}
	servers := "host.docker.internal:9094"
	go kafka.Consume(topics, servers, msgChan)

	http.Handle("/metrics", promhttp.Handler())
	go http.ListenAndServe(":8183", nil)

	repository := repository.NewRouteRepositoryMySql(db)
	freight := entity.NewFreight(10)
	createRouteUseCase := usecase.NewCreateRouteUseCase(repository, freight)
	changeRouteStatusUseCase := usecase.NewChangeRouteStatusUseCase(repository)

	for msg := range msgChan {
		input := usecase.CreateRouteInput{}
		json.Unmarshal(msg.Value, &input)

		switch input.Event {
		case "RouteCreated":
			output, err := createRouteUseCase.Execute(input)
			if err != nil {
				fmt.Println(err)
				errorsTotal.Inc()
			} else {
				routesCreated.Inc()
			}
			fmt.Println(output)

		case "RouteStarted":
			input := usecase.ChangeRouteStatusInput{}
			json.Unmarshal(msg.Value, &input)
			output, err := changeRouteStatusUseCase.Execute(input)
			if err != nil {
				fmt.Println(err)
				errorsTotal.Inc()
			} else {
				routesStarted.WithLabelValues("started").Inc()
			}
			fmt.Println(output)

		case "RouteFinished":
			input := usecase.ChangeRouteStatusInput{}
			json.Unmarshal(msg.Value, &input)
			output, err := changeRouteStatusUseCase.Execute(input)
			if err != nil {
				fmt.Println(err)
				errorsTotal.Inc()
			} else {
				routesStarted.WithLabelValues("finished").Inc()
			}
			fmt.Println(output)
		}

	}
}
